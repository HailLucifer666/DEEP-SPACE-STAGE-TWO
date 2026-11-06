// STAGE TWO — PROBE DRIVES (rider R-e extraction from src/combat.js): the deterministic
// ?droneProbe=1 / ?bossProbe=1 / ?pitchProbe=1 / ?dressingProbe=1 walks — the probe ticks, their
// probe state, and the query-flag wiring that lived inside combat.js. STRICTLY behavior-neutral
// move (story-016 R-e): the code is moved verbatim; a probe never runs when its flag is off.
// Import rule: probes.js must NOT import combat.js (house dep-check — acyclic graph). The
// ticks receive combat state + the pure helpers/constants they need as arguments — the same
// context pattern ENEMIES.tickEnemies / BOSS.tickBoss already use. Plain state lives HERE and
// restarts via resetProbes() on every combat enter (combat.js calls it in enterCombat).
// Review-fix split (story-018 review round, 2026-11-06): one walk per file — the story-018
// charge/powerup drives + their state bags moved VERBATIM to src/probes-charge.js /
// src/probes-powerup.js (the two-walk shared helpers to src/probes-common.js — a separate file
// because a probes.js home would cycle: probes.js re-exports the moved ticks). The re-exports
// below keep combat.js's import surface byte-identical; resetProbes delegates the two walks'
// state/window hygiene to the per-module reset exports (verbatim statements, moved not rewritten).
import * as ENEMIES from './enemies.js';
import * as DRONES from './drone.js';
import * as BOSS from './boss.js';
import * as DRESSING from './arena-dressing.js'; // story-017: combat-only ambient field + shell visual (reads its probe surfaces — never the reverse)
import { resetChargeProbe } from './probes-charge.js'; // review-fix split: the charge walk's state bag + window hygiene live with the drive now
import { resetPowerupProbe } from './probes-powerup.js'; // review-fix split: same, for the powerup walk
import { resetBalanceProbe } from './probes-balance.js'; // story-019: the balance walk's state bag + window hygiene live with the drive (the story-018 split precedent)

// story-018 walks (review-fix split): combat.js imports the ticks from HERE (the R-e wiring,
// unchanged) — these re-exports keep that import line byte-stable.
export { chargeProbeTick, resetChargeProbe } from './probes-charge.js';
export { powerupProbeTick, resetPowerupProbe } from './probes-powerup.js';
export { balanceProbeTick, resetBalanceProbe } from './probes-balance.js'; // story-019 re-export — the new walk rides the same wiring (combat.js's probes import gains exactly one name)

const qs = new URLSearchParams(location.search);
const DRONE_PROBE = qs.get('droneProbe') === '1'; // story-012: deterministic single-drone run
const BOSS_PROBE = qs.get('bossProbe') === '1'; // story-013: deterministic boss walk (skips the wave-5 wait)
const BOSS_SHOT = qs.get('bossShot') === '1'; // story-013 evidence variant: closer spawn + phase holds (screenshots)
const PITCH_PROBE = qs.get('pitchProbe') === '1'; // story-015: deterministic pitch+drift walk
const DRESSING_PROBE = qs.get('dressingProbe') === '1'; // story-017: deterministic dressing walk (ambient field + shell visual)

/* probe-owned state (the former C.dp* / C.bp* / C.pp fields in combat.js before R-e) — untouched by normal play */
const DP = { t: -1, drone: null, win: 0, done: false, tele: false, dive: false, contact: false, samples: 0, mm: null };
const BP = { t: -1, stage: 'spawn', stageT: 0, fired: 0, hpMark: 0, spawnWave: 0, hud: false, charged: false, raged: false, ragePinned: false, killed: false, done: false, dashPeakR3: 0, reorbitR3: 0, poleArmed: false, poleDone: false, poleQuietT: null, poleQuietAt: null, poleInDash: false, polePrev: null, poleL: null, poleE: null, poleDashPeakR3: 0, poleDashCapR3: null };
const PP = { state: null, done: false }; // the pitch walk's one probe-only object, rebuilt fresh on combat entry
const DD = { t: 0, stage: 0, mark: 0, sub: null, done: false, minCl: 0, samples: 0, pulses: [], entryShown: null, opacityAt78: null, opacityAt60: null }; // story-017 dressing walk — page-scoped (see resetProbes note + dressingProbeTick)

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
  // story-018: the charge/powerup walks' reports + the harness arm flags — stale-delete hygiene.
  // Review-fix split: those resets moved verbatim into each walk's module (resetChargeProbe /
  // resetPowerupProbe) — each state bag now lives beside its drive; the call order is unchanged
  // (they ran last here before the split).
  resetChargeProbe();
  resetPowerupProbe();
  resetBalanceProbe(); // story-019: the balance walk joins the stale-delete hygiene (called last — the story-018 split's call order)
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
