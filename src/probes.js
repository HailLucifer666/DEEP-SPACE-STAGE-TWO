// STAGE TWO — PROBE DRIVES (rider R-e extraction from src/combat.js): the deterministic
// ?droneProbe=1 / ?bossProbe=1 / ?pitchProbe=1 walks — the three probe ticks, their probe
// state, and the query-flag wiring that lived inside combat.js. STRICTLY behavior-neutral
// move (story-016 R-e): the code is moved verbatim; a probe never runs when its flag is off.
// Import rule: probes.js must NOT import combat.js (house dep-check — acyclic graph). The
// ticks receive combat state + the pure helpers/constants they need as arguments — the same
// context pattern ENEMIES.tickEnemies / BOSS.tickBoss already use. Plain state lives HERE and
// restarts via resetProbes() on every combat enter (combat.js calls it in enterCombat).
import * as ENEMIES from './enemies.js';
import * as DRONES from './drone.js';
import * as BOSS from './boss.js';
import * as DRESSING from './arena-dressing.js'; // story-017: combat-only ambient field + shell visual (reads its probe surfaces — never the reverse)
import * as POWERUPS from './powerups.js'; // story-018: forceDropForProbe + eachAlive + stats for the pickup walk (acyclic — powerups never imports probes/combat)

const qs = new URLSearchParams(location.search);
const DRONE_PROBE = qs.get('droneProbe') === '1'; // story-012: deterministic single-drone run
const BOSS_PROBE = qs.get('bossProbe') === '1'; // story-013: deterministic boss walk (skips the wave-5 wait)
const BOSS_SHOT = qs.get('bossShot') === '1'; // story-013 evidence variant: closer spawn + phase holds (screenshots)
const PITCH_PROBE = qs.get('pitchProbe') === '1'; // story-015: deterministic pitch+drift walk
const DRESSING_PROBE = qs.get('dressingProbe') === '1'; // story-017: deterministic dressing walk (ambient field + shell visual)
const CHARGE_PROBE = qs.get('chargeProbe') === '1'; // story-018: deterministic charged-shot walk
const POWERUP_PROBE = qs.get('powerupProbe') === '1'; // story-018: deterministic pickup/effect walk

/* probe-owned state (the former C.dp* / C.bp* / C.pp fields in combat.js before R-e) — untouched by normal play */
const DP = { t: -1, drone: null, win: 0, done: false, tele: false, dive: false, contact: false, samples: 0, mm: null };
const BP = { t: -1, stage: 'spawn', stageT: 0, fired: 0, hpMark: 0, spawnWave: 0, hud: false, charged: false, raged: false, ragePinned: false, killed: false, done: false, dashPeakR3: 0, reorbitR3: 0, poleArmed: false, poleDone: false, poleQuietT: null, poleQuietAt: null, poleInDash: false, polePrev: null, poleL: null, poleE: null, poleDashPeakR3: 0, poleDashCapR3: null };
const PP = { state: null, done: false }; // the pitch walk's one probe-only object, rebuilt fresh on combat entry
const DD = { t: 0, stage: 0, mark: 0, sub: null, done: false, minCl: 0, samples: 0, pulses: [], entryShown: null, opacityAt78: null, opacityAt60: null }; // story-017 dressing walk — page-scoped (see resetProbes note + dressingProbeTick)
// story-018 walk state (droneProbe pattern: plain state HERE, reset by resetProbes on combat entry)
const CP = {
  t: -1, stage: 0, mark: 0, done: false,
  tap: null, hold1: null, oneShotG: null, oneShotE: null, weak: null, burst3: 0,
  pause: null, death: null, chargeMax: 0, chargingSeen: false, reticle: null,
  bStream: 0, bCharged: 0, killsMark: 0, target: null, bossHpMark: 0, armed: false,
  hold1StreamAtCross: 0, hold1Cap: null, burstCycles: 0, od: null, burstDiag: [], pauseWall: 0, cycleB: 0,
};
const PU = {
  t: -1, stage: 0, mark: 0, sub: 0, done: false,
  stats0: null, kinds0: null, kills: 0, dropsMark: 0, target: null,
  rate: null, kinds: null, despawn: null, radius: null, spread: null, overdrive: null,
  shield: null, refresh: null, boss: null, pick: null, drop: null, mark2: 0, lastT: null, bolt: null, odFrames: 0, odDt: 0,
  shieldBefore: 0, regenMark: 0, baselineEntities: 0, shotTimes: [], lastCount: 0,
};

export function resetProbes() { // rider R-e: what enterCombat's inline probe resets did — same state, same window hygiene
  Object.assign(DP, { t: -1, drone: null, win: 0, done: false, tele: false, dive: false, contact: false, samples: 0, mm: null });
  Object.assign(BP, { t: -1, stage: 'spawn', stageT: 0, fired: 0, hpMark: 0, spawnWave: 0, hud: false, charged: false, raged: false, ragePinned: false, killed: false, done: false, dashPeakR3: 0, reorbitR3: 0, poleArmed: false, poleDone: false, poleQuietT: null, poleQuietAt: null, poleInDash: false, polePrev: null, poleL: null, poleE: null, poleDashPeakR3: 0, poleDashCapR3: null });
  PP.state = null; PP.done = false;
  window.__stage2.droneProbeLive = false;
  window.__stage2.bossProbeLive = false;
  window.__stage2.bossShotPhase = null;
  delete window.__stage2.bossProbe; // a fresh combat must never inherit the previous walk's report
  delete window.__stage2.droneProbe; // review NIT 7: same hygiene for the drone walk's report
  window.__stage2.pitchProbeLive = false;
  delete window.__stage2.pitchProbe; // same hygiene for the pitch walk's report
  // story-017: the dressing walk's report gets the same stale-free hygiene. Its MEASUREMENT
  // state (DD) is deliberately NOT reset here — the walk is page-scoped: it begins at combat
  // entry and its lifecycle witness spans the page's combat re-entries, so `done` latches
  // across resetProbes calls (see dressingProbeTick).
  Object.assign(DD, { t: 0, stage: 0, mark: 0, sub: null, minCl: 0, samples: 0, pulses: [], entryShown: null, opacityAt78: null, opacityAt60: null });
  window.__stage2.dressingProbeLive = false;
  delete window.__stage2.dressingProbe;
  // story-018: the charge/powerup walks' reports + the harness arm flags — stale-delete hygiene
  Object.assign(CP, {
    t: -1, stage: 0, mark: 0, done: false,
    tap: null, hold1: null, oneShotG: null, oneShotE: null, weak: null, burst3: 0,
    pause: null, death: null, chargeMax: 0, chargingSeen: false, reticle: null,
    bStream: 0, bCharged: 0, killsMark: 0, target: null, bossHpMark: 0, armed: false,
    hold1StreamAtCross: 0, hold1Cap: null, burstCycles: 0, od: null, burstDiag: [], pauseWall: 0, cycleB: 0,
  });
  Object.assign(PU, {
    t: -1, stage: 0, mark: 0, sub: 0, done: false,
    stats0: null, kinds0: null, kills: 0, dropsMark: 0, target: null,
    rate: null, kinds: null, despawn: null, radius: null, spread: null, overdrive: null,
    shield: null, refresh: null, boss: null, pick: null, drop: null, mark2: 0,
    shieldBefore: 0, regenMark: 0, baselineEntities: 0, shotTimes: [], lastCount: 0,
    bolt: null, odFrames: 0, odDt: 0,
  });
  delete window.__stage2.chargeProbe;
  delete window.__stage2.powerupProbe;
  delete window.__stage2.chargePauseArm; // harness-coordinated cancels: the arm flags never survive an entry
  delete window.__stage2.chargePauseGo;
  delete window.__stage2.chargeDeathArm;
}

/* ---------- story-018 shared drive helpers ----------
 * Probe-owned preconditions (pitchProbe/bossProbe precedent): empty field, wave pinned at 1
 * with a 99 s gap (wavesTick's 1.6 s cycle can never fire — the drive re-pins AFTER wavesTick
 * each frame, probes run last in tickCombat), ship healed + parked. `pin` is the per-tick
 * form; `clear` is the stage-entry form. */
function cpFieldClear(C) {
  ENEMIES.clearEnemies();
  DRONES.clearDrones();
}
function cpPin(C, heal) {
  C.wave = 1; C.waveGapT = 99;
  if (heal) { if (C.hp < 100) C.hp = 100; if (C.shield < 50) C.shield = 50; }
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
        cpFieldClear(C); CP.mark = CP.t; CP.stage = 26;
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
          weak: CP.weak, burst3: CP.burst3, burstDiag: CP.burstDiag, pause: CP.pause, death: CP.death,
          charge: { max: +Math.min(1, CP.chargeMax / 0.6).toFixed(3), chargingSeen: CP.chargingSeen },
          reticle: CP.reticle,
        };
        window.__stage2.chargeProbe = probe;
        C.api.report({ chargeProbe: probe }); // parity with scriptedKill/droneProbe — lands on lastReport too
      }
      return;
  }
}

/* ---------- story-018 powerup probe (?powerupProbe=1) ----------
 * Deterministic walk of the pickup system (imports powerups.js — acyclic). The RATE asserts
 * run REAL rolls through the REAL kill path: a probe raider seeded 8 u ahead + a probe bolt
 * into it → combat's bolt-kill site calls maybeDrop → Math.random() rolls are counted via
 * POWERUPS.stats() deltas (no seeded RNG is invented — architecture §7.1). Stages: 100 real
 * kills (drop rate, ≤1 drop/kill) → 300 more rolls (kind split ≈ 1/3) → despawn 8 s + blink
 * last 2 s (forced drop tracked via POWERUPS.eachAlive) → pickup radius full-3D (1.3 yes,
 * 1.6 no, vertical-offset 1.345 yes) → SPREAD (one shot = 3 bolts ±6°, charged single) →
 * OVERDRIVE (shot-to-shot interval ≈ 0.0568, charged single, suppression unchanged) → SHIELD
 * (refill 50, immediate regen in-window, 3 s delay restored after expiry) → refresh-not-stack
 * + concurrency + HUD chips → effects during the boss fight (boss exempt from drops).
 * Reports window.__stage2.powerupProbe (+ api.report parity). */
export function powerupProbeTick(dt, C, env) {
  if (!POWERUP_PROBE || PU.done) return;
  PU.t += dt;
  window.__stage2.puStage = PU.stage; // debug probe surface — the drive's live stage (deleted with the report latch)
  // the SHIELD stage owns the shield numbers (refill 50 / 30-mimic / restored-delay reads) —
  // housekeep must not heal over them; every other stage heals (stray hits cannot kill the walk)
  cpPin(C, !(PU.stage >= 21 && PU.stage <= 26));

  switch (PU.stage) {
    case 0: // settle + baseline
      if (PU.t >= 0.4) {
        cpFieldClear(C);
        C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0; C.heading = 0;
        PU.stats0 = POWERUPS.stats();
        PU.baselineEntities = (window.__stage2 && window.__stage2.entities) || 0;
        PU.stage = 1;
      }
      return;
    case 1: // 100 real bolt-path kills (the real maybeDrop rolls — pool steal-oldest caps entities at 6).
      // The probe bolt is RE-SEATED 0.2 u behind the pinned target EVERY drive tick: the scan
      // (which runs before this drive) then always reads it within the 1.05 hit radius — a free
      // 42 u/s bolt at low headless fps teleports 0.7-2.9 u per frame and can straddle the
      // ±1.05 window forever (the stage-1 hang the first green run hit). The kill site (and its
      // real maybeDrop roll) is combat's own boltsTick path either way.
      if (!PU.target) {
        env.forward(C.tmp);
        PU.target = ENEMIES.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 8));
        PU.target.userData.kind = 'rammer'; PU.target.userData.hp = 1;
        const b = C.bolts.spawn(); // probe bolt — re-seated onto the target every tick until the scan kills it
        b.position.copy(PU.target.position).addScaledVector(C.tmp, -0.2);
        b.userData.dir.copy(C.tmp);
        b.userData.life = env.BOLT_LIFE;
        b.userData.dmg = 1;
        b.lookAt(C.tmp2.copy(b.position).add(b.userData.dir));
        PU.bolt = b;
        if (!PU.mark2) PU.mark2 = PU.t; // the stage-1 watchdog mark
      } else {
        env.forward(C.tmp);
        PU.target.position.copy(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 8)); // pinned
        if (PU.bolt && PU.bolt.userData.alive) { // re-seat the probe bolt onto the kill window
          PU.bolt.position.copy(PU.target.position).addScaledVector(C.tmp, -0.2);
          PU.bolt.userData.life = env.BOLT_LIFE; // it dies of old age otherwise — re-arm it
        } else PU.bolt = null;
        if (!PU.target.userData.alive) { PU.kills++; PU.target = null; }
      }
      if (PU.kills >= 100 || (PU.mark2 && PU.t > PU.mark2 + 40)) { // watchdog: record honestly, never hang
        const s = POWERUPS.stats();
        PU.rate = { kills: PU.kills, drops: s.dropped - PU.stats0.dropped };
        if (PU.kills < 100) PU.rate.timeout = true;
        PU.target = null; PU.bolt = null; PU.mark2 = 0;
        POWERUPS.clearPowerups();
        PU.kinds0 = POWERUPS.stats();
        PU.kills = 0; PU.stage = 2;
      }
      return;
    case 2: // the uniform 1/3 kind split over M = 300 REAL DROPS (not rolls — 300 rolls at p=0.18
      // yields only ~54 drops and the per-kind binomial band assumes M drops; 10 rolls/tick keeps
      // the frame honest; ~1670 rolls ≈ 3 s at the 18% rate)
      for (let i = 0; i < 10; i++) {
        env.forward(C.tmp);
        POWERUPS.maybeDrop(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 8));
      }
      if (POWERUPS.stats().dropped - PU.kinds0.dropped >= 300) {
        const s = POWERUPS.stats();
        PU.kinds = {
          SPREAD: s.byKind.SPREAD - PU.kinds0.byKind.SPREAD,
          OVERDRIVE: s.byKind.OVERDRIVE - PU.kinds0.byKind.OVERDRIVE,
          SHIELD: s.byKind.SHIELD - PU.kinds0.byKind.SHIELD,
          drops: s.dropped - PU.kinds0.dropped, // the ACTUAL drop count (the 10-per-tick loop overshoots 300 by ≤ 10)
        };
        POWERUPS.clearPowerups();
        PU.stage = 3;
      }
      return;
    case 3: { // despawn + blink — one forced SPREAD pickup, tracked for 8.6 s
      POWERUPS.clearPowerups();
      C.effects.SPREAD = 0; C.effects.OVERDRIVE = 0; C.effects.SHIELD = 0; // probe-owned reset between stages
      env.forward(C.tmp);
      PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 12), 'SPREAD'); // 12 u out — never picked
      PU.mark = PU.t; PU.despawn = { aliveAt79: false, goneAt81: false, blinkAt55: null, blinkAt65: null, minO: 1, maxO: 0 };
      PU.stage = 4;
      return;
    }
    case 4: { // sample the pickup's life window (lastT tracks the despawn: vanished after ≥7.85 while tracked = the 8 s despawn — nothing else can remove it at 12 u)
      let found = null;
      POWERUPS.eachAlive((it) => { if (it === PU.drop && it.userData.alive) found = it; });
      if (found) {
        const t = found.userData.t;
        PU.lastT = t;
        const o = found.userData.core.material.opacity;
        if (o < PU.despawn.minO) PU.despawn.minO = o;
        if (o > PU.despawn.maxO) PU.despawn.maxO = o;
        if (t >= 5.5 && PU.despawn.blinkAt55 === null) PU.despawn.blinkAt55 = found.userData.blink; // < 6.0: blink must be OFF (blink starts at LIFE − BLINK = 6.0)
        if (t >= 6.4 && PU.despawn.blinkAt65 === null) PU.despawn.blinkAt65 = found.userData.blink; // > 6.0: blink must be ON
        if (t >= 7.85 && t < 7.95) PU.despawn.aliveAt79 = true;
      } else if (typeof PU.lastT === 'number' && PU.lastT >= 7.85) {
        PU.despawn.goneAt81 = true;
      }
      if (PU.t >= PU.mark + 8.6) {
        PU.despawn.opacitySwing = +(PU.despawn.maxO - PU.despawn.minO).toFixed(2);
        PU.stage = 5;
      }
      return;
    }
    case 5: // pickup radius — 1.3 from the SHIP CENTER picks up (the check is ship↔pickup, full 3D)
      POWERUPS.clearPowerups();
      C.effects.SPREAD = 0;
      env.forward(C.tmp);
      PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 1.3), 'SPREAD');
      PU.mark = PU.t; PU.dropsMark = POWERUPS.stats().picked; PU.stage = 6;
      return;
    case 6:
      if (PU.t >= PU.mark + 0.5) {
        PU.radius = { pickedAt13: POWERUPS.stats().picked > PU.dropsMark };
        PU.stage = 7;
      }
      return;
    case 7: { // 1.6 from the ship center does NOT (ship static, pickup static — distance never closes)
      POWERUPS.clearPowerups();
      env.forward(C.tmp);
      PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 1.6), 'OVERDRIVE');
      PU.mark = PU.t; PU.dropsMark = POWERUPS.stats().picked; PU.stage = 8;
      return;
    }
    case 8:
      if (PU.t >= PU.mark + 1.0) {
        PU.radius.pickedAt16 = POWERUPS.stats().picked > PU.dropsMark;
        PU.stage = 9;
      }
      return;
    case 9: { // full-3D proof: 0.9 along the ray + 1.0 straight up = 1.345 < 1.4 — the y-axis counts
      POWERUPS.clearPowerups();
      env.forward(C.tmp);
      PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 0.9).add(PU.upVec || (PU.upVec = { x: 0, y: 1.0, z: 0 })), 'SHIELD'); // from the ship center: 0.9 along + 1.0 up = 1.345 < 1.4 — the y-axis counts (full-3D proof)
      PU.mark = PU.t; PU.dropsMark = POWERUPS.stats().picked; PU.stage = 10;
      return;
    }
    case 10:
      if (PU.t >= PU.mark + 0.5) {
        PU.radius.pickedAt3D = POWERUPS.stats().picked > PU.dropsMark;
        POWERUPS.clearPowerups();
        C.effects.SPREAD = 0; C.effects.OVERDRIVE = 0; C.effects.SHIELD = 0;
        PU.stage = 11;
      }
      return;
    case 11: // SPREAD: drop 1.0 u ahead of the SHIP CENTER (the radius-stage pattern — proven
      // picked; the noseWorld seat is the suspect seam this bypasses) → picked → one shot = 3 bolts at ±6°
      POWERUPS.clearPowerups();
      env.forward(C.tmp);
      PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 1.0), 'SPREAD');
      PU.mark = PU.t; PU.stage = 12;
      return;
    case 12:
      if (C.effects.SPREAD > 0) {
        C.api.input.fire = true; PU.mark = PU.t; PU.bStream = C.fired.stream; PU.stage = 13;
      } else if (PU.t > PU.mark + 2) {
        PU.spread = { fan: 0, timeout: true, diag: { // one-shot diagnostic: where did the pickup actually land?
          live: POWERUPS.liveCount(),
          dropAlive: !!PU.drop && PU.drop.userData.alive,
          dropPos: PU.drop ? PU.drop.position.toArray().map((v) => +v.toFixed(2)) : null,
          shipPos: C.pos.toArray().map((v) => +v.toFixed(2)),
          picked: POWERUPS.stats().picked,
        } };
        PU.stage = 16;
      }
      return;
    case 13: // the shot fires the frame after fire=true — capture the 3 fan dirs while they live
      if (C.fired.stream > PU.bStream) {
        const dirs = [];
        C.bolts.update(0, (b) => { if (b.userData.alive && !b.userData.charged) dirs.push([b.userData.dir.x, b.userData.dir.y, b.userData.dir.z]); });
        env.forward(C.tmp);
        const center = [C.tmp.x, C.tmp.y, C.tmp.z];
        const ang = (d) => {
          const dot = Math.max(-1, Math.min(1, d[0] * center[0] + d[1] * center[1] + d[2] * center[2]));
          return +(Math.acos(dot) * 180 / Math.PI).toFixed(2);
        };
        const angles = dirs.map(ang).sort((a, b) => a - b);
        PU.spread = {
          fan: dirs.length,
          centerAngle: angles.length ? angles[0] : 99,
          anglePlus: angles.length > 2 ? angles[2] : 99,
          angleMinus: angles.length > 1 ? angles[1] : 99,
        };
        C.api.input.fire = false;
        PU.bCharged = C.fired.charged; PU.mark = PU.t; PU.stage = 14;
      } else if (PU.t > PU.mark + 1.5) { PU.spread = { fan: 0, timeout: true }; C.api.input.fire = false; PU.stage = 16; }
      return;
    case 14: // charged stays single under SPREAD: hold past the threshold, release
      if (PU.t >= PU.mark + 0.1) { C.api.input.fire = true; PU.mark = PU.t; PU.stage = 15; }
      return;
    case 15:
      if (PU.t >= PU.mark + 0.7) {
        C.api.input.fire = false; PU.mark = PU.t; PU.stage = 16;
      }
      return;
    case 16:
      if (PU.t >= PU.mark + 0.3) {
        if (PU.spread && !PU.spread.timeout) PU.spread.chargedSingle = C.fired.charged - PU.bCharged;
        POWERUPS.clearPowerups();
        C.effects.SPREAD = 0; C.effects.OVERDRIVE = 0; C.effects.SHIELD = 0;
        PU.stage = 17;
      }
      return;
    case 17: // OVERDRIVE: pickup, then a 1.2 s hold with per-shot timestamps
      POWERUPS.clearPowerups();
      env.forward(C.tmp);
      PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 1.0), 'OVERDRIVE');
      PU.mark = PU.t; PU.stage = 18;
      return;
    case 18:
      if (C.effects.OVERDRIVE > 0) {
        C.api.input.fire = true;
        PU.mark = PU.t; PU.bStream = C.fired.stream; PU.bCharged = C.fired.charged;
        PU.shotTimes = []; PU.lastCount = C.fired.stream; PU.overdrive = { suppressAt: null };
        PU.odFrames = 0; PU.odDt = 0; // frame-rate accounting — see the frameDt note at stage 20
        PU.stage = 19;
      } else if (PU.t > PU.mark + 2) { PU.overdrive = { interval: 0, timeout: true }; PU.stage = 22; }
      return;
    case 19: { // the rate window + the suppression mark (T_CHARGE unchanged under OVERDRIVE)
      PU.odFrames++; PU.odDt += dt; // the measured interval is FRAME-CAPPED at low fps (see stage 20)
      if (C.fired.stream > PU.lastCount) { PU.shotTimes.push(PU.t); PU.lastCount = C.fired.stream; }
      if (C.charging && PU.overdrive.suppressAt === null) PU.overdrive.suppressAt = +C.chargeT.toFixed(3);
      if (PU.t >= PU.mark + 1.2) {
        C.api.input.fire = false; PU.mark = PU.t; PU.stage = 20;
      }
      return;
    }
    case 20:
      if (PU.t >= PU.mark + 0.3) {
        const st = PU.shotTimes;
        if (st.length >= 2) {
          PU.overdrive.interval = +((st[st.length - 1] - st[0]) / (st.length - 1)).toFixed(4);
          PU.overdrive.windowS = +(st[st.length - 1] - st[0]).toFixed(3);
        } else PU.overdrive.interval = 0;
        PU.overdrive.chargedSingle = C.fired.charged - PU.bCharged;
        // EXACT counter form: the 0.6 s suppression caps the stream at ~10-11 shots per hold and
        // frame quantization (dt 0.017-0.067 vs the 0.0568 interval) makes per-shot timestamps
        // noisy — the fired.stream counter misses nothing, so the assert reads the COUNT against
        // the design rate (see the harness block for the band derivation).
        PU.overdrive.shots = C.fired.stream - PU.bStream;
        // FRAME-CAP note: the headless page can run at ~15 fps where dt (0.0667 s) EXCEEDS the
        // OVERDRIVE interval (0.0568 s) — the stream then fires every frame and the measured
        // shot-to-shot interval reads dt, not the design interval. frameDt lets the harness
        // accept the frame-capped reading without weakening the discriminative bound (a missing
        // OVERDRIVE still reads FIRE_INTERVAL 0.125 > dt + margin → red).
        PU.overdrive.frameDt = PU.odFrames ? +(PU.odDt / PU.odFrames).toFixed(4) : 0;
        POWERUPS.clearPowerups();
        C.effects.SPREAD = 0; C.effects.OVERDRIVE = 0; C.effects.SHIELD = 0;
        PU.stage = 21;
      }
      return;
    case 21: // SHIELD: refill 50 → hit mimic → immediate regen → expiry → delay restored
      POWERUPS.clearPowerups();
      C.shield = 10; // probe-owned precondition — the refill must read 50, not the healed value
      env.forward(C.tmp);
      PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 1.0), 'SHIELD');
      PU.mark = PU.t; PU.stage = 22;
      return;
    case 22:
      if (C.effects.SHIELD > 0) {
        PU.shield = { refill50: C.shield === 50 };
        C.shield = 30; C.regenT = 0; // hit mimic: damagePlayer zeroes regenT (the hit itself is not needed)
        PU.mark = PU.t; PU.stage = 23;
      } else if (PU.t > PU.mark + 2) { PU.shield = { refill50: false, timeout: true }; PU.stage = 26; }
      return;
    case 23: // in-window: the zero regen delay means regen resumes on the FIRST tick
      if (PU.t >= PU.mark + 0.3) {
        PU.shield.regenInWindow = C.shield > 30;
        PU.shield.regenAmount = +(C.shield - 30).toFixed(1);
        C.effects.SHIELD = 0.05; // probe-owned fast-forward to expiry (the 8 s wait is the despawn stage's job)
        PU.mark = PU.t; PU.stage = 24;
      }
      return;
    case 24: // expired — the 3 s delay must be RESTORED
      if (PU.t >= PU.mark + 0.3) {
        PU.shield.expired = C.effects.SHIELD === 0;
        C.shield = 30; C.regenT = 0;
        PU.mark = PU.t; PU.stage = 25;
      }
      return;
    case 25: // 1.0 s: no regen (the restored 3 s delay has not elapsed); then wait out the delay
      if (PU.t >= PU.mark + 1.0) {
        PU.shield.delayRestored = C.shield === 30;
        PU.mark2 = PU.t; PU.stage = 26;
      }
      return;
    case 26:
      if (C.regenT >= 3.2 || PU.t > PU.mark2 + 5) {
        PU.shield.regenResumed = C.regenT >= 3.2 && C.shield > 30;
        if (!PU.shield.regenResumed) PU.shield.timeout = true;
        POWERUPS.clearPowerups();
        C.effects.SPREAD = 0; C.effects.OVERDRIVE = 0; C.effects.SHIELD = 0;
        PU.stage = 27;
      }
      return;
    case 27: // refresh-not-stack + concurrency + chips
      POWERUPS.clearPowerups();
      C.shield = 50;
      env.forward(C.tmp);
      PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 1.0), 'SPREAD');
      PU.mark = PU.t; PU.stage = 28;
      return;
    case 28:
      if (C.effects.SPREAD > 0) { PU.mark = PU.t; PU.refresh = {}; PU.stage = 29; }
      else if (PU.t > PU.mark + 2) { PU.refresh = { refreshed: false, timeout: true }; PU.stage = 33; }
      return;
    case 29: // let the timer run down 1.5 s, then re-pick the SAME kind
      if (PU.t >= PU.mark + 1.5) {
        PU.refresh.before = +C.effects.SPREAD.toFixed(2);
        env.forward(C.tmp); // re-seat the spawn point — C.tmp2 is clobbered every frame by the chase-cam
        PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 1.0), 'SPREAD');
        PU.mark = PU.t; PU.stage = 30;
      }
      return;
    case 30:
      if (PU.t >= PU.mark + 0.2) {
        PU.refresh.after = +C.effects.SPREAD.toFixed(2);
        // the pick lands 1-3 frames after the re-seat, so `after` reads ≤ 0.2 s under 8 — the
        // refresh band is [7.5, 8.5]; a STACK (before + 8 ≈ 14.5) or a no-op (≤ before) fails it
        PU.refresh.refreshed = PU.refresh.after > 7.5 && PU.refresh.after <= 8.5;
        PU.refresh.stacked = PU.refresh.after > 8.5; // must be FALSE — refresh, never stack
        env.forward(C.tmp);
        PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 1.0), 'OVERDRIVE'); // a DIFFERENT kind mid-window
        PU.mark = PU.t; PU.stage = 31;
      }
      return;
    case 31: // concurrency + chips (both active at once; the chip line carries both names)
      if (PU.t >= PU.mark + 0.2) {
        PU.refresh.concurrent = C.effects.SPREAD > 0 && C.effects.OVERDRIVE > 0;
        try { PU.refresh.chipsActive = document.getElementById('hud-chips').textContent; } catch { PU.refresh.chipsActive = null; }
        C.effects.SPREAD = 0.03; C.effects.OVERDRIVE = 0.03; // probe-owned fast-forward — the chips must empty
        PU.mark = PU.t; PU.stage = 32;
      }
      return;
    case 32:
      if (PU.t >= PU.mark + 0.3) {
        try { PU.refresh.chipsGone = document.getElementById('hud-chips').textContent; } catch { PU.refresh.chipsGone = null; }
        POWERUPS.clearPowerups();
        PU.stage = 33;
      }
      return;
    case 33: { // effects during the boss fight — the boss itself never drops (no call site in the boss path)
      POWERUPS.clearPowerups();
      C.effects.SPREAD = 0; C.effects.OVERDRIVE = 0; C.effects.SHIELD = 0;
      env.forward(C.tmp);
      BOSS.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 20).setY(env.ARENA_Y));
      BOSS.probeHold(true);
      env.forward(C.tmp);
      PU.drop = POWERUPS.forceDropForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 1.0), 'OVERDRIVE');
      PU.mark = PU.t; PU.stage = 34;
      return;
    }
    case 34: // picked while BOSS.alive() — then the 0.5 s rate window (OVERDRIVE matters most there, GDD §6)
      if (C.effects.OVERDRIVE > 0 && BOSS.alive()) {
        PU.boss = { bossAliveAtPickup: true };
        C.api.input.fire = true;
        PU.mark = PU.t; PU.bStream = C.fired.stream; PU.shotTimes = []; PU.lastCount = C.fired.stream;
        PU.odFrames = 0; PU.odDt = 0; // frame-rate accounting (see the stage-20 FRAME-CAP note)
        PU.stage = 35;
      } else if (PU.t > PU.mark + 2) {
        // timeout lands in the SAME latch stage (35 does the cleanup + report) — never a dead end
        PU.boss = { bossAliveAtPickup: false, timeout: true };
        PU.mark = PU.t; PU.stage = 35;
      }
      return;
    case 35: { // the rate window with the boss alive (or the timeout's cleanup path — honest fields)
      if (PU.boss && PU.boss.bossAliveAtPickup === true) {
        PU.odFrames++; PU.odDt += dt;
        if (C.fired.stream > PU.lastCount) { PU.shotTimes.push(PU.t); PU.lastCount = C.fired.stream; }
      }
      if (PU.t >= PU.mark + 0.5) {
        C.api.input.fire = false;
        const st = PU.shotTimes;
        PU.boss.interval = st.length >= 2 ? +((st[st.length - 1] - st[0]) / (st.length - 1)).toFixed(4) : 0;
        PU.boss.frameDt = PU.odFrames ? +(PU.odDt / PU.odFrames).toFixed(4) : 0;
        PU.boss.shots = C.fired.stream - PU.bStream; // exact counter (see the stage-20 note)
        BOSS.clearBoss();
        cpFieldClear(C);
        POWERUPS.clearPowerups();
        PU.done = true;
        const probe = {
          rate: PU.rate, kinds: PU.kinds, despawn: PU.despawn, radius: PU.radius,
          spread: PU.spread, overdrive: PU.overdrive, shield: PU.shield, refresh: PU.refresh,
          boss: PU.boss, baselineEntities: PU.baselineEntities,
        };
        window.__stage2.powerupProbe = probe;
        C.api.report({ powerupProbe: probe }); // parity — lands on lastReport too
      }
      return;
    }
  }
}

/* ---------- story-012 drone probe (?droneProbe=1) ----------
 * Deterministic single-orb run: spawns 12 u ahead of the nose 0.4 s into combat (fixed knobs:
 * r 14, yAmp 5, yaw 0, first dive 1.2 s after spawn), samples its FULL-3D path for ~3 s, then
 * reports window.__stage2.droneProbe = { yRange, path3d, telegraph, dive, contact, droneBuild,
 * meshParts, waveRule, raiderRule }. yRange > 1 u over the window is the 3D-movement proof
 * (raiders never leave the XZ plane). droneBuild mirrors the build path that actually flew —
 * flow-check compares it against the inlined __DRONE_B64 token, so both build paths prove out
 * of the same assert. droneProbeLive is the screenshot runner's timing hook (window open). */
export function droneProbeTick(dt, C, env) {
  if (!DRONE_PROBE || DP.done) return;
  DP.t += dt;
  if (!DP.drone && DP.t >= 0.4 && DRONES.poolReady()) {
    env.forward(C.tmp);
    DP.drone = DRONES.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 12));
    DP.t = 0; DP.win = 0; // the measured window runs from the spawn
    return;
  }
  const d = DP.drone;
  if (!d) return;
  DP.win += dt;
  const u = d.userData;
  const m = DP.mm || (DP.mm = {
    minX: d.position.x, maxX: d.position.x,
    minY: d.position.y, maxY: d.position.y,
    minZ: d.position.z, maxZ: d.position.z,
  });
  m.minX = Math.min(m.minX, d.position.x); m.maxX = Math.max(m.maxX, d.position.x);
  m.minY = Math.min(m.minY, d.position.y); m.maxY = Math.max(m.maxY, d.position.y);
  m.minZ = Math.min(m.minZ, d.position.z); m.maxZ = Math.max(m.maxZ, d.position.z);
  DP.samples++;
  if (u.mode === 'telegraph') DP.tele = true;
  if (u.mode === 'dive') DP.dive = true;
  if (!u.alive) DP.contact = true; // died inside the window — the dive rammed the stationary ship
  window.__stage2.droneProbeLive = true;
  if (DP.win >= 3.0 || !u.alive) {
    DP.done = true;
    let parts = 0;
    d.traverse((o) => { if (o.isMesh) parts++; }); // GLB path has a different part count — mesh-level swap evidence
    const probe = {
      yRange: +(m.maxY - m.minY).toFixed(2),
      path3d: { x: +(m.maxX - m.minX).toFixed(2), y: +(m.maxY - m.minY).toFixed(2), z: +(m.maxZ - m.minZ).toFixed(2), samples: DP.samples },
      telegraph: DP.tele, dive: DP.dive, contact: DP.contact,
      droneBuild: DRONES.buildMode(),
      meshParts: parts,
      waveRule: [1, 2, 3, 4, 5].map((w) => DRONES.droneCountFor(w)),
      raiderRule: [1, 2, 3, 4].map((w) => ENEMIES.waveCount(w)),
    };
    window.__stage2.droneProbe = probe;
    window.__stage2.droneProbeLive = false;
    C.api.report({ droneProbe: probe }); // parity with scriptedKill — lands on __stage2.lastReport too
  }
}

/* ---------- story-013 boss probe (?bossProbe=1) ----------
 * Deterministic single-boss walk (droneProbe pattern): spawns the boss 26 u ahead of the nose
 * 0.4 s into combat (skips the wave-5 wait — spawnWave asserts it), then drives it end-to-end:
 *   weak/body ratio — the boss is PINNED (probeHold) and THREE real player bolts are fired
 *     into the weak node vs THREE into the ring hull: equal streams, damage ratio must be
 *     WEAK_MULT (end-to-end: zone detection + multiplier through the real bolt scan).
 *   phases — scripted damage (probeDamage) walks hp through the thresholds; the phase log
 *     must read orbit → charge → rage, and the charge dash must launch and overshoot.
 *     story-016: the drive PARKS THE SHIP on the shell (r3 = 78, on the boss's spawn ray) at
 *     charge entry — the shell-guard scenario; the drive samples the boss's r3 every tick
 *     (dashPeakR3) and at rage exit (reorbitR3) so the harness can assert the boss.js
 *     dashTarget clamp (the ONE story-016 boss.js line).
 *   death — hp 0 → slow-mo cinematic → bossDefeated report → the entity drains.
 * Reports window.__stage2.bossProbe = { phases, weakHits, bodyHits, weakDmg, bodyDmg, ratio,
 * chargeDash, overshoot, deathSlowmo, spawnWave, hudLine, dashPeakR3, reorbitR3, parkR3 }
 * (+ lastReport parity via api.report).
 * ?bossShot=1: evidence-capture variant — closer spawn + per-phase holds + bossShotPhase
 * markers for tools/boss-shot.mjs; the drive and its asserts are unchanged. */
function bossBolt(C, env, target, away) { // one real player bolt placed 3 u out on `away`, flying into `target`
  const b = C.bolts.spawn();
  b.position.copy(target).addScaledVector(away, 3.0);
  b.userData.dir.copy(away).negate();
  b.userData.life = env.BOLT_LIFE;
  b.lookAt(C.tmp.copy(b.position).add(b.userData.dir));
}
export function bossProbeTick(dt, C, env) {
  if (!BOSS_PROBE || BP.done) return;
  const rdt = dt / Math.max(0.05, C.api.getTimeScale()); // real-time clock — the death slow-mo must not stall the drive
  BP.t += rdt;
  BP.stageT += rdt;
  window.__stage2.bossProbeLive = true;
  const st = BOSS.state();
  // HUD evidence: sample the real DOM each tick while the boss lives
  if (st && C.ui.hudBars && C.ui.hudBars.textContent.includes('BOSS')) BP.hud = true;
  if (BOSS_SHOT) window.__stage2.bossShotPhase = st ? st.phase : 'dead';

  if (BP.stage === 'spawn') {
    if (BP.t >= 0.4) {
      env.forward(C.tmp);
      BOSS.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, BOSS_SHOT ? 14 : 26).setY(env.ARENA_Y));
      ENEMIES.clearEnemies(); // stage-2 review: the drive simulates the NATURAL boss fight — the warden
      // spawns instead of wave BOSS_WAVE+1, so the field is clear (wave-1 raiders gone). Without
      // this, the victory card's score assert cannot reproduce the mid-tick wave-grant class.
      BP.spawnWave = C.wave;
      BP.hpMark = BOSS.state().hp;
      BP.stage = 'weak'; BP.stageT = 0; BP.fired = 0;
      BOSS.probeHold(true); // pin the boss for the deterministic ratio test
    }
    return;
  }
  if (BP.stage === 'weak' || BP.stage === 'body') {
    const node = BP.stage === 'weak';
    if (BP.fired < 3 && BP.stageT >= BP.fired * 0.35 + 0.1) {
      const t = BOSS.probeTargets(C.pos);
      const target = node ? t.node : t.hull;
      bossBolt(C, env, target, C.tmp.copy(C.pos).sub(target).normalize());
      BP.fired++;
    }
    const ps = BOSS.probeStats();
    if ((node ? ps.weakHits : ps.bodyHits) >= 3 || BP.stageT > 3.0) {
      BP.hpMark = st ? st.hp : 0;
      BP.stage = node ? 'body' : 'charge';
      BP.stageT = 0; BP.fired = 0;
      if (!node) BOSS.probeHold(false); // behavior resumes for the charge/rage walk
    }
    return;
  }
  if (BP.stage === 'charge') {
    if (!BP.charged && st) {
      // story-016 shell-guard scenario (probe-owned precondition, pitchProbe re-seat precedent):
      // park the ship ON the shell — r3 = 78, on the boss's spawn ray (+z) so the dash reads
      // radial. An UNclamped dashTarget captured here sits at r3 78, outside the 68 clamp, and
      // the 10 u OVERSHOOT carries the boss to r3 ≈ 88 (the mutation's red); the clamp pulls
      // the captured target to ≤ 68 so the dash peaks ≈ 78 and re-orbits inside.
      C.pos.set(0, env.ARENA_Y, 78); C.vel.set(0, 0, 0);
      BOSS.probeDamage(st.hp - 34, C.api); BP.charged = true; // 57% — below CHARGE_AT 0.66
    }
    const hold = BOSS_SHOT ? 2.2 : 0;
    const ps = BOSS.probeStats();
    if (!BP.poleArmed && ps.chargeDash && ps.overshoot) {
      // POLE scenario (fix-pass finding 1): the EQUATOR dash just completed — re-park the ship
      // at the TOP POLE (0, 96, 0): r3 78 straight up +y, the EXACT escape the clamp exists to
      // prevent — and wait out the next periodic dash (CHARGE_EVERY 5 s). The operator-order bug
      // in boss.js launchDash measures |O − (P−O)| = 60 < 68 here, so its Math.min(60, 68) +
      // setLength(60) pulls the captured target INWARD to r3 60 instead of clamping to 68.
      // Sticky counters cannot tell the second dash from the first, so the drive waits for the
      // boss's altitude-climb transient to settle (1 s sustained < 20 u/s, ~2 s after arming)
      // then watches for the dash's 30 u/s burst. BOSS.probeStats().dashCapR3 — the clamp's
      // own computed radius (boss.js launchDash, the ONE fixed line) — is captured at the
      // launch frame. NOTE: the dash's OBSERVABLE endpoint is invariant to the clamp in this
      // geometry (the boss orbits AT the player's altitude, so the dash direction is flat and
      // the overshoot projection along it cancels the vertical target delta) — the captured-
      // target value is the only seam that discriminates the operator-order bug.
      BP.poleArmed = true; BP.poleDone = false;
      BP.poleQuietT = null; BP.poleQuietAt = null; BP.poleInDash = false;
      BP.polePrev = null; BP.poleL = null; BP.poleE = null; BP.poleSp = [];
      BP.poleDashPeakR3 = 0; BP.poleDashCapR3 = null;
      BOSS.probeSealDashCap(); // re-review advisory: null the boss's dashCapR3 seam at pole arming — the equator dash wrote 68; if the pole-launch stamp ever drops, the assert must read null (red by absence), never the stale 68
      C.pos.set(0, 96, 0); C.vel.set(0, 0, 0);
    }
    const bpPos = BOSS.probeTargets(C.pos).node; // story-016: sample the boss's world position every drive tick — the dash IS the r3 peak (pre-dash orbit holds ≤ ~48 from the parked ship)
    const r3Now = +Math.hypot(bpPos.x, bpPos.y - env.ARENA_Y, bpPos.z).toFixed(2);
    if (BP.poleArmed && !BP.poleDone) {
      BP.poleDashPeakR3 = Math.max(BP.poleDashPeakR3, r3Now);
      if (BP.polePrev) {
        const spRaw = bpPos.distanceTo(BP.polePrev) / Math.max(0.001, rdt);
        BP.poleSp.push(spRaw); if (BP.poleSp.length > 10) BP.poleSp.shift();
        let sp = 0;
        if (BP.poleSp.length === 10) { // median over 10 frames — headless micro-dt frames (dt spikes) produce absurd single-frame speeds (observed spMax 7180); the median classifies the true motion
          const s = [...BP.poleSp].sort((a, b) => a - b);
          sp = s[5];
        }
        if (!BP.poleQuietAt && sp < 20) {
          if (BP.poleQuietT === null) BP.poleQuietT = BP.stageT;
          if (BP.stageT - BP.poleQuietT >= 1.0) BP.poleQuietAt = BP.t;
        } else if (!BP.poleQuietAt) {
          BP.poleQuietT = null;
        } else if (sp > 20) {
          if (!BP.poleInDash) { BP.poleInDash = true; BP.poleL = bpPos.clone(); }
          else BP.poleE = bpPos.clone();
        } else if (BP.poleInDash) {
          // dash ended — the clamp's computed target radius was captured at the launch frame
          BP.poleDashCapR3 = ps.dashCapR3 == null ? null : +ps.dashCapR3.toFixed(2);
          BP.poleDone = true; BP.stage = 'rage'; BP.stageT = 0;
        }
        BP.polePrev = bpPos.clone(); // per-frame baseline — stale baselines (early return) read absurd speeds
      } else {
        BP.polePrev = bpPos.clone();
      }
      if (!BP.poleDone && BP.stageT > 16 + hold) { // pole timeout — the asserts record what's missing
        BP.poleDone = true; BP.stage = 'rage'; BP.stageT = 0;
      }
    } else {
      BP.dashPeakR3 = Math.max(BP.dashPeakR3, r3Now);
      if (BP.stageT > 6.0 + hold) { BP.stage = 'rage'; BP.stageT = 0; } // timeout — the asserts record what's missing
    }
    return;
  }
  if (BP.stage === 'rage') {
    if (!BP.raged && st) { BOSS.probeDamage(st.hp - 15, C.api); BP.raged = true; } // 25% — below RAGE_AT 0.33
    if (BOSS_SHOT && st && st.phase === 'rage' && !BP.ragePinned) {
      // evidence framing: hold the boss 14 u ahead of the nose for the rage screenshot —
      // the natural 20 u rage orbit carries it out of the chase-cam frame at random bearings
      BOSS.probeHold(true);
      env.forward(C.tmp);
      BOSS.probePlace(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 14).setY(env.ARENA_Y));
      BP.ragePinned = true;
    }
    if (st && st.phase === 'rage' && BP.stageT >= (BOSS_SHOT ? 2.4 : 0.8)) {
      const rpPos = BOSS.probeTargets(C.pos).node; // story-016: boss r3 ~0.8 s after the dash ended — the re-orbit must be back inside (orbit seek pulls it inward of the parked ship)
      BP.reorbitR3 = +Math.hypot(rpPos.x, rpPos.y - env.ARENA_Y, rpPos.z).toFixed(2);
      BP.stage = 'death'; BP.stageT = 0;
    }
    return;
  }
  if (BP.stage === 'death') {
    if (!BP.killed && st) { BOSS.probeDamage(st.hp, C.api); BP.killed = true; }
    const rep = window.__stage2.lastReport;
    if ((!BOSS.alive() && rep && rep.bossDefeated) || BP.stageT > 10) {
      BP.done = true;
      const ps = BOSS.probeStats();
      const probe = {
        phases: ps.phases,
        weakHits: ps.weakHits, bodyHits: ps.bodyHits,
        weakDmg: ps.weakDmg, bodyDmg: ps.bodyDmg,
        ratio: ps.bodyDmg > 0 ? +(ps.weakDmg / ps.bodyDmg).toFixed(2) : 0,
        chargeDash: ps.chargeDash, overshoot: ps.overshoot,
        deathSlowmo: ps.deathSlowmo,
        spawnWave: BP.spawnWave,
        hudLine: BP.hud,
        dashPeakR3: +BP.dashPeakR3.toFixed(2), reorbitR3: +BP.reorbitR3.toFixed(2), // story-016 shell guard (GDD §5.3)
        parkR3: +Math.hypot(C.pos.x, C.pos.y - env.ARENA_Y, C.pos.z).toFixed(2), // the parked ship's r3 — provenance for the two asserts above
        poleDashCapR3: BP.poleDashCapR3, poleDashPeakR3: +BP.poleDashPeakR3.toFixed(2), // pole scenario (fix-pass finding 1): captured dash-target r3 (clamp's own value) + sampled boss r3 peak over the phase
        bossDefeated: (rep && rep.bossDefeated) || null, // the death report the drive observed (lastReport is a single slot — the probe report lands after it)
      };
      window.__stage2.bossProbe = probe;
      window.__stage2.bossProbeLive = false;
      window.__stage2.bossShotPhase = null;
      C.api.report({ bossProbe: probe }); // parity with scriptedKill/droneProbe — lands on __stage2.lastReport too
    }
  }
}

/* ---------- story-015 pitch probe (?pitchProbe=1) ----------
 * Deterministic full walk of the new axes (droneProbe/bossProbe pattern). The drive
 * synthesizes R/F into the REAL key set and writes the pointer NDC into the SAME mouse
 * object steer() reads — zero input.js changes. Stages in order:
 *   scan (0.4-2.4 s) — one gunner + one rammer spawned 20 u DIRECTLY above a stationary
 *     ship; both position-pinned for the window (bossProbe probeHold precedent: their own
 *     altitude-follow would otherwise enter ram range at ~2.0 s and blur the measurement —
 *     the follow mechanic itself is measured LIVE by the follow stage below). NO healing
 *     in-window: an hp+shield drop or a regenT reset IS the hit signal (nothing else can
 *     reach the ship in 2.4 s — wave raiders are still 38 u out). XZ-only scans hit both
 *     (the story's stated red); 3D scans pass.
 *   pitch — R 0.4 s (≈0.72 rad) + yaw independence, pointer +0.8 (direct) / −0.8 (mirror),
 *     deadzone 0.05 parked, R 1.5 s clamp hold, F 0.4 s. C.pitch is reset to 0 between
 *     sub-tests (probe-owned precondition, bossProbe probeDamage precedent) so each window
 *     measures unsaturated.
 *   drift — W to cruise, 1.0 s full yaw (slip + velMag sampled at the first tick ≥ 1.0 s),
 *     0.8 s release (recovery), then a re-seated one-rev circle at full yaw (mean/max radius
 *     to the sample centroid; aligned-entry re-seat is the probe-owned precondition).
 *   bolt — C.pitch set to 45° (recorded), one bolt through the REAL spawn path (noseWorld +
 *     forward), tracked 0.5 s (rise + xz-speed; retried if an enemy scan kills it early).
 *   sep (story-016 rider R-f) — two probe rammers at ONE XZ, 0.5 u apart vertically, wobble
 *     phase pinned equal, sampled 2.2 s: the separation dy term must part them (> 1.5 u);
 *     XZ-only separation leaves them in lockstep (the mutation's red). The 015 band-climb
 *     stage that occupied this slot was RETIRED with the band scaffold — the sphere probes
 *     run on the main flow page (story-016 record; never a quiet edit).
 *   follow — two probe gunners seated AT the arena plane, player seated +20 (a plain
 *     high-altitude offset since the retirement): their mean y must trail within 12 u over
 *     3 s (offset0 recorded).
 * Reports window.__stage2.pitchProbe (pitchProbeLive is the screenshot hook; api.report
 * parity lands lastReport). Damage is healed AFTER the scan window — a ~22 s drive must not
 * die mid-walk with wave raiders orbiting the stationary ship. */
export function pitchProbeTick(dt, C, env) {
  if (!PITCH_PROBE || PP.done) return;
  const pp = PP.state || (PP.state = {
    t: 0, stage: 0, mark: 0, entryPitch: 0, maxPhi: 0, h0: 0, hp0: 0, regenMark: 0,
    dPhi: {}, slip: {}, driftPath: {}, boltRise: {}, sep: {}, raiderScan: { ramContact: false, boltHit: false }, raiderFollow: {}, viewDirFromUp: {},
    pts: [], scanG: null, scanR: null, bolt: null, boltP0: null, boltTries: 0,
    noseUpY: 0, sepA: null, sepB: null, sepMax: 0, sepSamples: 0,
    follow: [], followAcc: 0, followN: 0,
  });
  pp.t += dt;
  window.__stage2.pitchProbeLive = true;
  if (pp.stage >= 2) { if (C.hp < env.HP_MAX) C.hp = env.HP_MAX; if (C.shield < env.SHIELD_MAX) C.shield = env.SHIELD_MAX; } // the scan window stays honest — heal only after it closes
  const keys = C.api.input.keys;
  const mouse = C.api.input.mouse;

  if (pp.stage === 0) {
    pp.entryPitch = C.pitch; // combat-entry snapshot — the replay-never-inherits-a-nose-up contract (GDD §5.6)
    if (pp.t >= 0.4) {
      pp.scanG = ENEMIES.spawnForProbe(C.tmp2.set(C.pos.x, C.pos.y + 20, C.pos.z));
      pp.scanG.userData.kind = 'gunner'; pp.scanG.userData.hp = 2; // gunner: its sitting bolts are the bolt-hit signal
      pp.scanG.userData.fireT = 0.5; // probe-owned precondition (review fix 5): the live spawn's 1.2-2.2 s first-shot delay left ~20% of runs bolt-less in the 2.4 s window — pin the PROBE raider only, live spawn math untouched
      pp.scanR = ENEMIES.spawnForProbe(C.tmp2.set(C.pos.x, C.pos.y + 20, C.pos.z)); // rammer: the ram-contact signal
      pp.hp0 = C.hp + C.shield; pp.regenMark = C.regenT;
      pp.stage = 1;
    }
    return;
  }
  if (pp.stage === 1) { // elevated-raider scan window — pin BOTH probe raiders at +20
    pp.scanG.position.set(C.pos.x, C.pos.y + 20, C.pos.z);
    pp.scanR.position.set(C.pos.x, C.pos.y + 20, C.pos.z);
    if (C.hp + C.shield < pp.hp0 || C.regenT < pp.regenMark) pp.raiderScan.boltHit = true; // damage landed
    pp.regenMark = Math.max(pp.regenMark, C.regenT);
    if (pp.t >= 2.4) {
      pp.raiderScan.ramContact = !pp.scanR.userData.alive; // a ram kills the rammer in place
      pp.raiderScan.windowS = 2;
      ENEMIES.hitDrone(pp.scanG, 99); ENEMIES.hitDrone(pp.scanR, 99); // release the field for the follow stage
      pp.scanG = null; pp.scanR = null;
      mouse.x = 0; mouse.y = 0; C.api.input.mouseActive = false;
      C.pitch = 0; pp.h0 = C.heading; pp.mark = pp.t;
      keys.add('KeyR'); // B1 hold begins at the NEXT steer() — the window tolerances absorb the one-frame skew
      pp.stage = 2;
    }
    return;
  }
  if (pp.stage === 2) { // B1: R 0.4 s → Δφ ≈ 0.72; heading must not move
    if (pp.t >= pp.mark + 0.4) {
      keys.delete('KeyR');
      pp.dPhi.rHold04 = +C.pitch.toFixed(4);
      // story-016 rider R-b: the window's ACTUAL duration — pp.t − pp.mark spans exactly the
      // frames steer() integrated the key (steer runs before this probe on the same dt), so
      // |Δφ − PITCH_RATE·Δt| measures integration honesty at any fps (harness assert, < 0.02)
      pp.dPhi.rHold04s = +(pp.t - pp.mark).toFixed(4);
      pp.dPhi.headingDrift = +(C.heading - pp.h0).toFixed(4);
      // story-016 rider R-g: the RENDERED nose — pose quaternion is the previous frame's
      // (tickCombat writes pose.rotation AFTER this probe), so this reads the pose as rendered
      // with the key held; nose.y > 0 guards the p.rotation.x = −C.pitch render sign
      pp.noseUpY = +C.tmp.set(0, 0, 1).applyQuaternion(C.pose.quaternion).y.toFixed(4);
      C.pitch = 0; // probe-owned reset between sub-tests — each window measures unsaturated
      mouse.x = 0; mouse.y = 0.8; C.api.input.mouseActive = true;
      pp.mark = pp.t;
      pp.stage = 3;
    }
    return;
  }
  if (pp.stage === 3) { // B2: pointer NDC +0.8 for 1.0 s — DIRECT: up = nose up
    if (pp.t >= pp.mark + 1.0) {
      pp.dPhi.ptrUp = +C.pitch.toFixed(4);
      C.pitch = 0; mouse.y = -0.8;
      pp.mark = pp.t;
      pp.stage = 4;
    }
    return;
  }
  if (pp.stage === 4) { // B3: pointer NDC −0.8 — mirror
    if (pp.t >= pp.mark + 1.0) {
      pp.dPhi.ptrDown = +C.pitch.toFixed(4);
      C.camera.getWorldDirection(C.tmp); // R1 guard (review fix 3): view direction at max DOWN pitch — folded angle off the vertical axis (un-pinned steady ≈14-15°)
      pp.viewDirFromUp.down = +(Math.acos(Math.min(1, Math.abs(C.tmp.y))) * 180 / Math.PI).toFixed(2);
      C.pitch = 0; mouse.y = 0.05;
      pp.mark = pp.t;
      pp.stage = 5;
    }
    return;
  }
  if (pp.stage === 5) { // B4: pointer parked inside the deadzone (|y| = 0.05 < 0.08)
    if (pp.t >= pp.mark + 1.0) {
      pp.dPhi.deadzone = +C.pitch.toFixed(4);
      mouse.y = 0; C.api.input.mouseActive = false;
      C.pitch = 0; pp.maxPhi = 0;
      keys.add('KeyR'); pp.mark = pp.t;
      pp.stage = 6;
    }
    return;
  }
  if (pp.stage === 6) { // B5: R held 1.5 s — clamps at PITCH_MAX and STAYS (0.7 s to clamp, 0.8 s held)
    pp.maxPhi = Math.max(pp.maxPhi, C.pitch);
    if (pp.t >= pp.mark + 1.5) {
      keys.delete('KeyR');
      pp.dPhi.clampEnd = +C.pitch.toFixed(4); pp.dPhi.clampMax = +pp.maxPhi.toFixed(4);
      C.camera.getWorldDirection(C.tmp); // R1 guard at max UP pitch (see B3; un-pinned steady ≈25°)
      pp.viewDirFromUp.up = +(Math.acos(Math.min(1, Math.abs(C.tmp.y))) * 180 / Math.PI).toFixed(2);
      C.pitch = 0;
      keys.add('KeyF'); pp.mark = pp.t;
      pp.stage = 7;
    }
    return;
  }
  if (pp.stage === 7) { // B6: F 0.4 s — mirror of B1
    if (pp.t >= pp.mark + 0.4) {
      keys.delete('KeyF');
      pp.dPhi.fHold04 = +C.pitch.toFixed(4);
      pp.dPhi.fHold04s = +(pp.t - pp.mark).toFixed(4); // rider R-b: same rate-consistency window as B1
      C.pitch = 0;
      keys.add('KeyW'); pp.mark = pp.t; // cruise for the drift stages
      pp.stage = 8;
    }
    return;
  }
  if (pp.stage === 8) { // C0: W to cruise
    if (C.speed >= 16.5 || pp.t >= pp.mark + 2.5) {
      keys.add('KeyA'); pp.mark = pp.t;
      pp.stage = 9;
    }
    return;
  }
  if (pp.stage === 9) { // C1: 1.0 s full yaw — slip + magnitude sampled at the first tick ≥ 1.0 s
    if (pp.t >= pp.mark + 1.0) {
      keys.delete('KeyA');
      const f = env.forward(C.tmp);
      const dot = env.clamp(C.vel.dot(f) / Math.max(0.001, C.vel.length()), -1, 1);
      pp.slip.deg = +(Math.acos(dot) * 180 / Math.PI).toFixed(2);
      pp.slip.velMag = +C.vel.length().toFixed(3);
      pp.slip.speed = +C.speed.toFixed(2); // review fix 2: denominator sampled at the SAME tick as velMag — the old stage-8 capture was 1.0 s stale (speed kept ramping to 17), leaving a 0.3% margin at the 0.9 floor
      pp.mark = pp.t;
      pp.stage = 10;
    }
    return;
  }
  if (pp.stage === 10) { // C2: release — 0.8 s later the slip must be < 8°
    if (pp.t >= pp.mark + 0.8) {
      const f = env.forward(C.tmp);
      const dot = env.clamp(C.vel.dot(f) / Math.max(0.001, C.vel.length()), -1, 1);
      pp.slip.recoveredDeg = +(Math.acos(dot) * 180 / Math.PI).toFixed(3);
      // C3: re-seat (probe-owned precondition: aligned entry, arena-center safe — the circle
      // keeps r ≤ ~10) and trace one full rev at full yaw
      C.pos.set(0, env.ARENA_Y, 0); C.pitch = 0;
      C.vel.copy(env.forward(C.tmp)).multiplyScalar(C.speed);
      keys.add('KeyA'); pp.mark = pp.t; pp.pts.length = 0;
      pp.stage = 11;
    }
    return;
  }
  if (pp.stage === 11) { // C3: sample the rev
    pp.pts.push([C.pos.x, C.pos.z]);
    if (pp.t >= pp.mark + 2 * Math.PI / env.TURN_RATE) {
      keys.delete('KeyA');
      const cx = pp.pts.reduce((a, p2) => a + p2[0], 0) / pp.pts.length;
      const cz = pp.pts.reduce((a, p2) => a + p2[1], 0) / pp.pts.length;
      let sum = 0, mx = 0;
      for (const p2 of pp.pts) { const d2 = Math.hypot(p2[0] - cx, p2[1] - cz); sum += d2; if (d2 > mx) mx = d2; }
      pp.driftPath.radius = +(sum / pp.pts.length).toFixed(2);
      pp.driftPath.radiusMax = +mx.toFixed(2);
      pp.driftPath.samples = pp.pts.length;
      pp.driftPath.revS = +(2 * Math.PI / env.TURN_RATE).toFixed(3);
      // D: pitched bolt — 45° through the REAL spawn path (noseWorld + forward), tracked 0.5 s
      C.pitch = 0.7854;
      pp.boltRise.phi = +C.pitch.toFixed(4);
      const b = C.bolts.spawn();
      env.noseWorld(b.position);
      env.forward(b.userData.dir);
      b.userData.life = env.BOLT_LIFE;
      b.lookAt(C.tmp.copy(b.position).add(b.userData.dir));
      pp.bolt = b; pp.boltP0 = b.position.clone(); pp.mark = pp.t; pp.boltTries = 0;
      pp.stage = 12;
    }
    return;
  }
  if (pp.stage === 12) { // bolt tracking — an enemy-scan kill retries (≤3), else records honestly
    if (!pp.bolt.userData.alive && pp.t < pp.mark + 0.5 && pp.boltTries < 3) {
      pp.boltTries++;
      const b = C.bolts.spawn();
      env.noseWorld(b.position);
      env.forward(b.userData.dir);
      b.userData.life = env.BOLT_LIFE;
      b.lookAt(C.tmp.copy(b.position).add(b.userData.dir));
      pp.bolt = b; pp.boltP0 = b.position.clone(); pp.mark = pp.t;
      return;
    }
    if (pp.t >= pp.mark + 0.5) {
      pp.boltRise.dy = +(pp.bolt.position.y - pp.boltP0.y).toFixed(2);
      pp.boltRise.xzSpeed = +(Math.hypot(pp.bolt.position.x - pp.boltP0.x, pp.bolt.position.z - pp.boltP0.z) / (pp.t - pp.mark)).toFixed(2);
      pp.boltRise.seconds = +(pp.t - pp.mark).toFixed(3);
      pp.boltRise.tries = pp.boltTries;
      if (pp.bolt.userData.alive) C.bolts.kill(pp.bolt);
      pp.bolt = null;
      // G (story-016 rider R-f): coincident-stack separation pair — two probe rammers at ONE
      // XZ, 0.5 u apart vertically, wobble phase PINNED equal (probe-owned precondition:
      // identical steering + XZ-only separation = lockstep, so only the new dy term can part
      // them). The 015 band-climb stage that lived here was RETIRED with the band scaffold —
      // the sphere probes run on the main flow page (story-016 record).
      // FIX PASS 2026-11-05 (quality-review finding 2): STRENGTHENED — the guard could not
      // discriminate dy alone because LIVE wave raiders in scratch parted the co-located pair
      // in XZ (dy-removal stayed 105/105). Clear the field at window entry (clearEnemies, the
      // bossProbeTick precedent) so the pair's identical-steering lockstep holds exactly and dy
      // is the sole variable. wavesTick re-populates ~1.6 s after emptiness, so the window is
      // bound to 1.2 s < 1.6 s. The ship is frozen at the center: movement keys RELEASED and
      // BOTH C.vel and C.speed zeroed — steer() re-lerps vel toward forward·speed every frame,
      // so the cruise speed left by the earlier W stage re-accelerates the ship and the moving
      // target would break the lockstep (observed) — and the pair spawns 50 u ahead; a chase at
      // 34.5 u/s reaches ram range only after ~1.4 s > the window, so the pair survives
      // untouched to the release kill.
      ENEMIES.clearEnemies();
      keys.delete('KeyW'); keys.delete('KeyR'); keys.delete('KeyA'); keys.delete('KeyD');
      C.pos.set(0, env.ARENA_Y, 0); C.vel.set(0, 0, 0); C.speed = 0;
      pp.sepA = ENEMIES.spawnForProbe(C.tmp2.set(50, env.ARENA_Y, 0));
      pp.sepB = ENEMIES.spawnForProbe(C.tmp2.set(50, env.ARENA_Y + 0.5, 0));
      pp.sepA.userData.phase = 0; pp.sepB.userData.phase = 0;
      pp.sepMax = 0; pp.sepSamples = 0;
      pp.mark = pp.t;
      pp.stage = 13;
    }
    return;
  }
  if (pp.stage === 13) { // separation window: 1.2 s (< 1.6 s wavesTick re-population — fix-pass strengthen) — the pair must push apart in FULL 3D
    // enforce the probe-owned lockstep: identical XZ every frame — the pool's intra-tick
    // update order lets raider A move before B reads it, so a sub-frame XZ offset appears and
    // the separation force amplifies it (observed: maxPairDist 2.33 with dy dropped) — with
    // XZ forced equal, dy is the sole variable and the 3D distance IS |Δy|.
    pp.sepA.position.x = pp.sepB.position.x;
    pp.sepA.position.z = pp.sepB.position.z;
    const dxs = pp.sepA.position.x - pp.sepB.position.x,
      dys = pp.sepA.position.y - pp.sepB.position.y,
      dzs = pp.sepA.position.z - pp.sepB.position.z;
    pp.sepMax = Math.max(pp.sepMax, +Math.hypot(dxs, dys, dzs).toFixed(3));
    pp.sepSamples++;
    if (pp.t >= pp.mark + 1.2) {
      ENEMIES.hitDrone(pp.sepA, 99); ENEMIES.hitDrone(pp.sepB, 99); // release the field
      pp.sepA = null; pp.sepB = null;
      pp.sep.maxPairDist = +pp.sepMax.toFixed(3);
      pp.sep.samples = pp.sepSamples;
      // F: altitude-follow — two probe gunners seated AT the arena plane, player seated +20
      // (a plain high-altitude offset since the band retirement): their mean y must trail
      // within 12 u over 3 s
      C.pitch = 0; C.heading = 0;
      C.pos.set(0, env.ARENA_Y, 0); C.vel.set(0, 0, 0);
      pp.follow = [
        ENEMIES.spawnForProbe(C.tmp2.set(10, env.ARENA_Y, 0)),
        ENEMIES.spawnForProbe(C.tmp2.set(-10, env.ARENA_Y, 0)),
      ];
      pp.follow.forEach((g) => { g.userData.kind = 'gunner'; g.userData.hp = 2; });
      C.pos.y = env.ARENA_Y + 20; C.vel.set(0, 0, 0); // +20 seat (was the band ceiling — retired)
      pp.raiderFollow.offset0 = 20;
      pp.mark = pp.t; pp.followAcc = 0; pp.followN = 0;
      pp.stage = 14;
    }
    return;
  }
  if (pp.stage === 14) { // follow window: 3 s of LIVE altitude-follow (no pinning here)
    const live = pp.follow.filter((g) => g.userData.alive);
    if (live.length) {
      const meanY = live.reduce((a, g) => a + g.position.y, 0) / live.length;
      pp.followAcc += Math.abs(meanY - C.pos.y);
      pp.followN++;
    }
    if (pp.t >= pp.mark + 3.0) {
      pp.raiderFollow.meanDelta = +(pp.followAcc / Math.max(1, pp.followN)).toFixed(2);
      pp.raiderFollow.followN = pp.followN; // survivor samples feeding the mean (review fix 8: an all-dead pair makes the mean vacuous — ÷1 guard reads 0.00)
      pp.raiderFollow.raiders = pp.follow.length;
      pp.follow.forEach((g) => ENEMIES.hitDrone(g, 99));
      pp.follow = [];
      keys.delete('KeyW'); // review fix 7: the cruise key must not outlive the walk — the probe page stops driving once the report latches
      PP.done = true;
      const probe = {
        entryPitch: +(pp.entryPitch || 0).toFixed(4),
        dPhi: pp.dPhi, slip: pp.slip, driftPath: pp.driftPath, boltRise: pp.boltRise,
        sep: pp.sep, noseUpY: pp.noseUpY, // story-016 riders R-f/R-g; the 015 `band` field was retired with the band scaffold
        raiderScan: pp.raiderScan, raiderFollow: pp.raiderFollow, viewDirFromUp: pp.viewDirFromUp,
      };
      window.__stage2.pitchProbe = probe;
      window.__stage2.pitchProbeLive = false;
      C.api.report({ pitchProbe: probe }); // parity with scriptedKill/droneProbe/bossProbe — lands on __stage2.lastReport too
    }
  }
}

/* ---------- story-017 dressing probe (?dressingProbe=1) ----------
 * Deterministic walk of the combat-only ambient dressing (droneProbe/pitchProbe pattern).
 * Stages, in order:
 *   entry (0 s) — snap the field/shell visibility at combat entry (the re-show half of the
 *     rim-ring lifecycle), clear the enemy field + reseat the ship at O (probe-owned
 *     precondition; bossProbe/pitchProbe precedent), then start the clearance walk: W cruise
 *     + full-yaw orbit (drift circle radius ≈7 u around O) + varied-pitch pulses (R/F 0.35 s
 *     every 2 s). The orbit stays ≥ ~18 u from the shell's inner edge (25 u), so the
 *     geometric clearance margin is ~15-18 u. The field is cleared EVERY tick during the walk
 *     + HP/shield healed (pitchProbe precedent) — the walk must not die mid-drive with wave
 *     raiders orbiting the ship.
 *   walk (10 s) — sample the nearest instance-to-ship 3D distance every tick (min over the
 *     drive).
 *   parks — teleport-park at r3 78 (bossProbe shell-park precedent: C.pos set, vel/speed
 *     zeroed, keys released), wait 0.6 s for the driver to settle, sample shell opacity (> 0,
 *     design 0.162); re-park at r3 60, wait, sample (== 0).
 *   report — { ambientCount, shellFill, clearance, shell: { material, opacityAt78,
 *     opacityAt60 }, lifecycle: { shownOnEnter } } on window.__stage2.dressingProbe
 *     (+ lastReport parity via api.report). The clear/re-show lifecycle half is verified by
 *     the HARNESS via __stage2.dressingLive() across a death → gameover → SKIP → combat
 *     re-entry walk (see flow-check's story-017 block) — the in-page tick cannot witness the
 *     gameover gap (it only runs in combat). */
export function dressingProbeTick(dt, C, env) {
  if (!DRESSING_PROBE || DD.done) return;
  DD.t += dt;
  window.__stage2.dressingProbeLive = true;
  const keys = C.api.input.keys;

  if (DD.stage === 0) { // entry snapshot + walk start
    DD.entryShown = DRESSING.fieldVisible();
    C.hp = env.HP_MAX; C.shield = env.SHIELD_MAX;
    ENEMIES.clearEnemies();
    C.pos.set(0, env.ARENA_Y, 0); C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0;
    C.api.input.mouseActive = false; // pointer parked — no steering interference
    keys.delete('KeyW'); keys.delete('KeyA'); keys.delete('KeyD'); keys.delete('KeyR'); keys.delete('KeyF'); keys.delete('Space');
    keys.add('KeyW'); keys.add('KeyA'); // cruise + full-yaw orbit
    DD.pulses = [];
    for (let i = 1; i <= 9; i += 2) DD.pulses.push({ at: i, key: 'KeyR', on: false, releaseAt: 0 }); // up
    for (let i = 2; i <= 8; i += 2) DD.pulses.push({ at: i, key: 'KeyF', on: false, releaseAt: 0 }); // down
    DD.mark = DD.t; DD.minCl = Infinity; DD.samples = 0;
    DD.stage = 1;
    return;
  }

  if (DD.stage === 1) { // the 10 s clearance walk
    ENEMIES.clearEnemies(); // the field never crowds the walk — wave raiders respawn ~1.6 s
    if (C.hp < env.HP_MAX) C.hp = env.HP_MAX;
    if (C.shield < env.SHIELD_MAX) C.shield = env.SHIELD_MAX;
    for (const p of DD.pulses) {
      if (!p.on && DD.t >= DD.mark + p.at) { keys.add(p.key); p.on = true; p.releaseAt = DD.t + 0.35; }
      if (p.on && DD.t >= p.releaseAt) { keys.delete(p.key); p.on = false; }
    }
    const near = DRESSING.nearestTo(C.pos);
    if (near) { DD.minCl = Math.min(DD.minCl, near.d); DD.samples++; }
    if (DD.t >= DD.mark + 10.0) {
      keys.delete('KeyW'); keys.delete('KeyA');
      for (const p of DD.pulses) keys.delete(p.key);
      DD.stage = 2; DD.sub = 'park78'; DD.mark = DD.t;
      C.pos.set(0, env.ARENA_Y, 78); C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0; // r3 78 park
    }
    return;
  }

  if (DD.stage === 2) { // shell opacity parks
    if (DD.sub === 'park78') {
      if (DD.t >= DD.mark + 0.6) {
        DD.opacityAt78 = +DRESSING.shellOpacity().toFixed(4);
        DD.sub = 'park60'; DD.mark = DD.t;
        C.pos.set(0, env.ARENA_Y, 60); C.vel.set(0, 0, 0); C.speed = 0; // r3 60 park
      }
      return;
    }
    if (DD.sub === 'park60') {
      if (DD.t >= DD.mark + 0.6) {
        DD.opacityAt60 = +DRESSING.shellOpacity().toFixed(4);
        const probe = {
          ambientCount: DRESSING.fieldCount(),
          shellFill: DRESSING.shellFill(),
          clearance: { min: +DD.minCl.toFixed(2), samples: DD.samples },
          shell: { material: DRESSING.shellMaterial(), opacityAt78: DD.opacityAt78, opacityAt60: DD.opacityAt60 },
          lifecycle: { shownOnEnter: DD.entryShown },
        };
        window.__stage2.dressingProbe = probe;
        window.__stage2.dressingProbeLive = false;
        DD.done = true;
        C.api.report({ dressingProbe: probe }); // parity — lands on __stage2.lastReport too
      }
      return;
    }
  }
}
