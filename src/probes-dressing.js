// STAGE TWO — story-017 DRESSING probe drive (one walk per file — the story-018 split
// precedent; the walk moved verbatim from src/probes.js, Task A follow-up 2026-11-10: the
// file hit the <800-line project rule after the Task A warn/shell extension, and the split
// is the fix the probes.js header documents). This module owns ?dressingProbe=1 and NOTHING
// else. probes.js re-exports the tick + the reset so combat.js's import surface stays
// byte-identical; resetProbes delegates the reset here (stale-delete hygiene, report deleted
// with the state). probes never import combat.js — the tick receives combat state + the pure
// helpers/constants it needs as arguments (probeEnv).
// Deterministic walk of the combat-only ambient dressing (droneProbe/pitchProbe pattern).
// Stages, in order (story-017 original walk + the Task A 2026-11-10 warn/shell extension):
//   entry (0 s) — snap the field visibility at combat entry (the re-show half of the
//     rim-ring lifecycle), clear the enemy field + reseat the ship at O (probe-owned
//     precondition; bossProbe/pitchProbe precedent), then start the clearance walk: W cruise
//     + full-yaw orbit (drift circle radius ≈7 u around O) + varied-pitch pulses (R/F 0.35 s
//     every 2 s). The field is cleared EVERY tick during the walk + HP/shield healed
//     (pitchProbe precedent) — the walk must not die mid-drive with wave raiders orbiting
//     the ship.
//   walk (10 s) — sample the nearest instance-to-ship 3D distance every tick (min over the
//     drive).
//   rock witness (Task B 2026-11-10, story 7.5 Step 5 sanctioned shape — replaces the old
//     self-seeded center test, which probed collideRocks with a static {x,y,z} literal and
//     no velocity: the fixture-generosity trap, FIX-PROTOCOL STAGE 4.6). The REAL ship is
//     driven through the REAL steer() path against rock 0 (world coords via the exposed
//     getRock(0) getter) in three windows: impact (seated overlapping with real inward
//     velocity — exactly one damage tick, push-out, never crosses the rock center), graze
//     (overlap re-pinned every tick with ZERO closing speed across the cooldown — the
//     2026-11-10 incident condition; the vn<0 gate must drain nothing), bolt (one real
//     player bolt 3 u off the surface aimed at the center — dies at the rock, no
//     pass-through). Damage events are counted from C.telemetry.damageTaken.rock — the
//     ONLY accumulator damagePlayer(...,'rock') writes; boss volleys (this walk's wave
//     cadence can seat the warden mid-window) tag 'bolt' and cannot pollute it.
//   warn parks (Task A 2026-11-10, Story 7.6 Step 3 sanctioned asserts) — probe-owned
//     re-parks at r3 65 / 75 / 20, each settled 0.2 s before its #warn sample (the warn
//     writer in combat.js steer recomputes from r3 every tick; vel/speed zeroed so the park
//     is steady). Samples the element's live render state: visible / text / .danger class.
//   report — { ambientCount, shellFill, clearance, shellRemoved (MEASURED — shellScan, see
//     that helper), lifecycle: { shownOnEnter }, rockHit: { radius, impact, graze,
//     boltStopped }, laneHiddenInCombat (MEASURED — launch.js setLaneVisible's __stage2
//     mirror, the dressingLive precedent), warn: { approaching, turnBack, inside } } on
//     window.__stage2.dressingProbe (+ lastReport parity via api.report).
//     The clear/re-show lifecycle half is verified by the HARNESS via __stage2.dressingLive()
//     across a death → gameover → SKIP → combat re-entry walk (see flow-check's story-017
//     block) — the in-page tick cannot witness the gameover gap (it only runs in combat).
import * as ENEMIES from './enemies.js';
import * as DRESSING from './arena-dressing.js'; // story-017: combat-only ambient field (reads its probe surfaces — never the reverse)

const qs = new URLSearchParams(location.search);
const DRESSING_PROBE = qs.get('dressingProbe') === '1'; // story-017: deterministic dressing walk (ambient field + shell visual)

const DD = { t: 0, stage: 0, mark: 0, sub: null, done: false, minCl: 0, samples: 0, pulses: [], entryShown: null, opacityAt78: null, opacityAt60: null, rockHit: null, warn65: null, warn75: null, warnIn: null, rw: null }; // story-017 dressing walk — page-scoped (see the reset note + dressingProbeTick); Task A 2026-11-10 adds the warn-park + rockHit sample fields; Task B 2026-11-10 adds rw (the rock-witness scratch bag, rebuilt at stage-2 arm)

export function resetDressingProbe() { // probes.js resetProbes delegates (the story-018 split's call order)
  // story-017: the dressing walk's report gets the same stale-free hygiene. Its MEASUREMENT
  // state (DD) is deliberately NOT fully reset here — the walk is page-scoped: it begins at
  // combat entry and its lifecycle witness spans the page's combat re-entries, so `done`
  // latches across reset calls (see dressingProbeTick).
  Object.assign(DD, { t: 0, stage: 0, mark: 0, sub: null, minCl: 0, samples: 0, pulses: [], entryShown: null, opacityAt78: null, opacityAt60: null, rockHit: null, warn65: null, warn75: null, warnIn: null, rw: null }); // Task A 2026-11-10: the warn-park + rockHit samples join the same stale-free hygiene; Task B 2026-11-10: rw joins (a mid-walk death restarts the drive from stage 0 — no stale impact/graze samples may ride)
  window.__stage2.dressingProbeLive = false;
  delete window.__stage2.dressingProbe;
}

// the Task A warn-park handoff — body moved verbatim from the old stage-2 tail (the stage
// grew into the Task B rock-witness drive, so the shared exit lives here once)
function warnHandoff(C, env) {
  ENEMIES.clearEnemies(); C.hp = env.HP_MAX; C.shield = env.SHIELD_MAX; // walk discipline — the stationary ship must not die mid-sampling
  C.pos.set(0, env.ARENA_Y, 65); C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0;
  DD.mark = DD.t; DD.sub = 'warn65'; DD.stage = 3;
}

// the Task B rockHit report assembly — one shape, both exits (the bolt window's death path
// and its spawn-failure path; every field absent there reads null/false downstream → red by
// absence, never a vacuous green)
function rockWitnessReport(rw, boltStopped) {
  // Story 7.5 step 4 (2026-11-11): the crash-physics witnesses are MEASURED in the impact
  // window — postCrashSpeedRatio = C.speed right after the crash tick ÷ speed just before
  // impact (read before the probe's throttle release, so steer's halving is what it sees);
  // crashCooldown = C.rockCooldown read right after the crash tick. Absent crash → null
  // fields → red by absence downstream, never a vacuous green.
  const crashRatio = rw.postCrashSpeed !== undefined && rw.preSpeed > 0
    ? +(rw.postCrashSpeed / rw.preSpeed).toFixed(4) : null;
  return {
    radius: rw.r0.radius,
    impact: { hpDelta: rw.hpDelta, hpTicks: rw.ticks, rockDmg: rw.rockDmg, sawOverlap: rw.saw, endOverlapFree: rw.endPen === 0, minAxial: +rw.minAx.toFixed(2), endAxial: +rw.endAx.toFixed(2), deflected: rw.saw && rw.endPen === 0 && rw.minAx > 0, postCrashSpeedRatio: crashRatio, crashCooldown: rw.crashCooldown !== undefined ? rw.crashCooldown : null, windowS: 1.0 },
    graze: { hpDelta: rw.gzDelta, hpTicks: rw.gzTicks, rockDmg: rw.gzRockDmg, pinnedOverlapTicks: rw.gzPins, penMin: +rw.gzPenMin.toFixed(2), windowS: 1.2 },
    boltStopped,
  };
}

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

  if (DD.stage === 2) { // rock-collision witness — story 7.5 Step 5 sanctioned shape (Task B 2026-11-10).
    // The pre-Task-B stage was a self-seeded center test: a static {x,y,z} literal (NOT the
    // ship) probed collideRocks with no velocity — it proved detection exists and nothing
    // else (the fixture-generosity trap, FIX-PROTOCOL STAGE 4.6). The sanctioned shape below
    // drives the REAL ship through the REAL steer() path (probe-owned re-seat, bossProbe
    // shell-park precedent) against rock 0's LIVE world coords (the exposed getRock getter):
    //   impact — the ship seated 0.5 u INSIDE the rock with REAL inward velocity (17 u/s =
    //     MAX_SPEED along the nose; the flight model's vel chases forward·speed so it holds
    //     through steer): exactly one damage tick (hpTicks), the rock-damage sum (rockDmg),
    //     and deflected — ends overlap-free AND never crosses the rock center (minAxial > 0:
    //     the anti-fly-through discriminator — a removed push-out ends the fixture on the
    //     rock's FAR side, overlap-free too, so endOverlapFree alone cannot witness it).
    //     Story 7.5 step 4 (2026-11-11): the impact window also measures the crash physics —
    //     postCrashSpeedRatio (C.speed right after the crash tick ÷ speed just before impact,
    //     read BEFORE the probe's throttle release so steer's halving is what it sees) and
    //     crashCooldown (C.rockCooldown read right after the crash tick).
    //   graze — the 2026-11-10 incident condition: the ship re-seated overlapping every
    //     tick with vel/speed zeroed (closing speed vn = 0) for 1.2 s = 2× the 0.6 s crash
    //     cooldown (story 7.5 step 4 raised it 0.35 → 0.6). The vn<0 gate must drain NOTHING (graze.rockDmg 0 / hpTicks 0); the
    //     ungated pre-fix code re-fired the clamp minimum (~6) every 0.35 s here — the
    //     sustained ~17 dps drain. pinnedOverlapTicks is the fixture guard (a broken seat
    //     reads 0 → honest red, never a vacuous green).
    //   bolt — one real player bolt spawned 3 u off the surface aimed at the center
    //     (bossProbe bossBolt placement pattern): must die at the rock (travel ≤ 8 u —
    //     life expiry travels 77) without passing through (endDist < radius + 0.5 — the
    //     kill shell is the bolt's 0.4 collision radius; beyond it means pass-through).
    // Damage-event counting: damagePlayer(...,'rock') is the ONLY writer of
    // C.telemetry.damageTaken.rock and adds exactly once per event — per-tick deltas count
    // events and sum damage, immune to the boss volley ('bolt' tag) this walk's wave
    // cadence can seat mid-window. Shield regen is pinned OFF (C.regenT = 0 every tick —
    // a regen tick would inflate hp+shield and mask the deltas). The throttle releases at
    // the FIRST impact damage tick so the post-bounce outward drift clears the rock (the
    // sustained-contact re-entry cycle is what the graze window measures deliberately).
    ENEMIES.clearEnemies(); C.regenT = 0; // walk discipline + regen pin (see above)
    const rw = DD.rw;
    if (!rw) { // arm: seat the ship overlapping rock 0 with real inward velocity
      const r0 = DRESSING.getRock ? DRESSING.getRock(0) : null;
      if (!r0) { DD.rockHit = null; warnHandoff(C, env); return; } // rock absent → the asserts read null (red by absence)
      const uxz = Math.hypot(r0.wx, r0.wz);
      const ux = uxz > 1 ? r0.wx / uxz : 1, uz = uxz > 1 ? r0.wz / uxz : 0; // deterministic XZ-radial approach axis (yaw drift is tangential — ⟂ this axis)
      const minD = 1.1 + r0.radius; // 1.1 = SHIP_R, the ship radius steer passes to collideRocks (combat.js call site, story 7.5 step 4 plan value) — keep in step with it
      C.pos.set(r0.wx + ux * (minD - 0.5), r0.wy, r0.wz + uz * (minD - 0.5));
      C.heading = Math.atan2(-ux, -uz); C.pitch = 0; C.bank = 0; // nose into the rock
      C.vel.set(-ux * 17, 0, -uz * 17); C.speed = 17; // REAL inward velocity — NOT zeroed (the old test's trap)
      for (const k of ['KeyW', 'KeyA', 'KeyD', 'KeyR', 'KeyF', 'Space']) keys.delete(k);
      C.api.input.mouseActive = false;
      DD.rw = { r0, ux, uz, minD, sub: 'impact', mark: DD.t, hp0: C.hp + C.shield, dmg0: C.telemetry.damageTaken.rock, last: C.telemetry.damageTaken.rock, ticks: 0, saw: DRESSING.collideRocks(C.pos, 1.1, null) > 0, minAx: Infinity, preSpeed: C.speed }; // preSpeed = the throttle just before impact (seat sets 17; kept fresh below until the crash)
      return;
    }
    if (rw.sub === 'impact') {
      const ax = (C.pos.x - rw.r0.wx) * rw.ux + (C.pos.z - rw.r0.wz) * rw.uz; // signed offset along the approach axis (+ = entry side)
      const dm = C.telemetry.damageTaken.rock;
      if (dm > rw.last) { // a damage tick fired during this frame's steer — the crash
        rw.ticks++; rw.last = dm;
        if (rw.ticks === 1) { // the crash tick — measure AFTER steer ran, BEFORE the throttle release below
          rw.postCrashSpeed = C.speed; // steer already applied the plan's halving (17 → 8.5; story 7.5 step 4)
          rw.crashCooldown = C.rockCooldown; // set 0.6 in steer this frame — not yet decremented (read right after the crash tick)
        }
        C.speed = 0; // release at the FIRST damage tick
      } else if (rw.ticks === 0) {
        rw.preSpeed = C.speed; // still pre-impact — hold the speed just before the crash tick
      }
      if (ax < rw.minAx) rw.minAx = ax;
      if (DD.t >= rw.mark + 1.0) {
        rw.endPen = DRESSING.collideRocks(C.pos, 1.1, null);
        rw.endAx = ax;
        rw.hpDelta = +(C.hp + C.shield - rw.hp0).toFixed(2);
        rw.rockDmg = rw.last - rw.dmg0;
        rw.sub = 'graze'; rw.mark = DD.t;
        rw.gzHp0 = C.hp + C.shield; rw.gzDmg0 = C.telemetry.damageTaken.rock; rw.gzLast = rw.gzDmg0;
        rw.gzTicks = 0; rw.gzPins = 0; rw.gzPenMin = Infinity;
      }
      return;
    }
    if (rw.sub === 'graze') {
      const g0 = DRESSING.getRock(0); // re-read every tick — the field group keeps yawing (~0.005 rad/s); the getter is the exposed world transform (probe-only path, pitchProbe's per-tick clone precedent)
      if (g0) {
        const guxz = Math.hypot(g0.wx, g0.wz);
        const gx = guxz > 1 ? g0.wx / guxz : 1, gz2 = guxz > 1 ? g0.wz / guxz : 0;
        const gminD = 1.1 + g0.radius; // SHIP_R in step with steer's call site (story 7.5 step 4)
        C.pos.set(g0.wx + gx * (gminD - 0.5), g0.wy, g0.wz + gz2 * (gminD - 0.5)); // the pin: steer() sees this overlap on its next tick
        C.vel.set(0, 0, 0); C.speed = 0; // closing speed exactly 0 — the incident's hover/graze condition
        const gpen = DRESSING.collideRocks(C.pos, 1.1, null);
        if (gpen > 0) rw.gzPins++;
        if (gpen < rw.gzPenMin) rw.gzPenMin = gpen;
      }
      const dm2 = C.telemetry.damageTaken.rock;
      if (dm2 > rw.gzLast) { rw.gzTicks++; rw.gzLast = dm2; }
      if (DD.t >= rw.mark + 1.2) { // = 2× the 0.6 s crash cooldown (story 7.5 step 4) — a refire-capable span (the ungated pre-fix code re-fired every cooldown here)
        rw.gzDelta = +(C.hp + C.shield - rw.gzHp0).toFixed(2);
        rw.gzRockDmg = rw.gzLast - rw.gzDmg0;
        rw.sub = 'bolt'; rw.mark = DD.t; rw.bolt = null;
      }
      return;
    }
    if (rw.sub === 'bolt') { // one real player bolt into the same rock (bossProbe bossBolt placement pattern)
      if (!rw.bolt) {
        const g0 = DRESSING.getRock(0); // fresh coords — the bolt + its endDist witness use the SAME frame's rock (drift ≤ 0.1 u over the 0.5 s watch)
        const b = g0 ? C.bolts.spawn() : null;
        if (!b) { // pool/rock absent → record honestly and hand off (no hang; asserts read died:false → red)
          DD.rockHit = rockWitnessReport(rw, { spawned: false, died: false, travel: -1, endDist: -1 });
          warnHandoff(C, env);
          return;
        }
        const guxz = Math.hypot(g0.wx, g0.wz);
        const gx = guxz > 1 ? g0.wx / guxz : 1, gz2 = guxz > 1 ? g0.wz / guxz : 0;
        rw.br = { wx: g0.wx, wy: g0.wy, wz: g0.wz };
        C.tmp2.set(g0.wx, g0.wy, g0.wz);
        C.tmp.set(gx, 0, gz2);
        b.position.copy(C.tmp2).addScaledVector(C.tmp, g0.radius + 3.0); // 3 u off the surface, on the approach axis
        b.userData.dir.copy(C.tmp).negate();
        b.userData.life = env.BOLT_LIFE;
        b.lookAt(C.tmp2.copy(b.position).add(b.userData.dir));
        rw.p0 = { x: b.position.x, y: b.position.y, z: b.position.z };
        rw.bolt = b;
        return;
      }
      if (!rw.bolt.userData.alive || DD.t >= rw.mark + 0.5) {
        const b = rw.bolt;
        const travel = Math.hypot(b.position.x - rw.p0.x, b.position.y - rw.p0.y, b.position.z - rw.p0.z);
        const endDist = Math.hypot(b.position.x - rw.br.wx, b.position.y - rw.br.wy, b.position.z - rw.br.wz);
        if (b.userData.alive) C.bolts.kill(b); // never leak a live bolt into the warn parks (pitchProbe precedent)
        DD.rockHit = rockWitnessReport(rw, { spawned: true, died: !b.userData.alive, travel: +travel.toFixed(2), endDist: +endDist.toFixed(2) });
        warnHandoff(C, env); // the Task A warn-park handoff — body verbatim (see the helper)
        return;
      }
      return;
    }
  }

  if (DD.stage === 3) { // warn park 60 <= r3 < 72 → APPROACHING ZONE EDGE, .danger ABSENT
    ENEMIES.clearEnemies();
    if (C.hp < env.HP_MAX) C.hp = env.HP_MAX;
    if (C.shield < env.SHIELD_MAX) C.shield = env.SHIELD_MAX;
    if (DD.t >= DD.mark + 0.2) {
      DD.warn65 = warnSample(C, env.ARENA_Y);
      C.pos.set(0, env.ARENA_Y, 75); C.vel.set(0, 0, 0); C.speed = 0;
      DD.mark = DD.t; DD.sub = 'warn75'; DD.stage = 4;
    }
    return;
  }

  if (DD.stage === 4) { // warn park r3 >= 72 → END OF COMBAT ZONE - TURN BACK, .danger PRESENT
    ENEMIES.clearEnemies();
    if (C.hp < env.HP_MAX) C.hp = env.HP_MAX;
    if (C.shield < env.SHIELD_MAX) C.shield = env.SHIELD_MAX;
    if (DD.t >= DD.mark + 0.2) {
      DD.warn75 = warnSample(C, env.ARENA_Y);
      C.pos.set(0, env.ARENA_Y, 20); C.vel.set(0, 0, 0); C.speed = 0;
      DD.mark = DD.t; DD.sub = 'warnIn'; DD.stage = 5;
    }
    return;
  }

  if (DD.stage === 5) { // warn park back inside r3 < 60 → hidden; then the measured report
    ENEMIES.clearEnemies();
    if (C.hp < env.HP_MAX) C.hp = env.HP_MAX;
    if (C.shield < env.SHIELD_MAX) C.shield = env.SHIELD_MAX;
    if (DD.t >= DD.mark + 0.2) {
      DD.warnIn = warnSample(C, env.ARENA_Y);
      DD.done = true;
      const probe = {
        ambientCount: DRESSING.fieldCount(),
        shellFill: DRESSING.shellFill(),
        clearance: { min: +DD.minCl.toFixed(2), samples: DD.samples },
        shellRemoved: shellScan(C.scene), // Task A 2026-11-10: MEASURED (was the literal `true` — a tautology, defect class false green)
        lifecycle: { shownOnEnter: DD.entryShown },
        rockHit: DD.rockHit,
        // Task B 2026-11-10 (Story 7.5 Step 3): the launch-corridor lane rocks hidden while in
        // combat — MEASURED off launch.js setLaneVisible's __stage2 mirror (dressingLive
        // precedent). `undefined` mirror (surface removed) reads false → the harness assert reds.
        laneHiddenInCombat: !!(window.__stage2 && window.__stage2.laneVisible === false),
        wreckVisibleInCombat: !!(window.__stage2 && window.__stage2.wreckVisible === true), // Story 7.5 Step 3 (2026-11-11): MEASURED off launch.js's wreckVisible mirror — undefined reads false → honest red
        warn: { approaching: DD.warn65, turnBack: DD.warn75, inside: DD.warnIn }, // Task A 2026-11-10 (Story 7.6 Step 3)
      };
      window.__stage2.dressingProbe = probe;
      window.__stage2.dressingProbeLive = false;
      C.api.report({ dressingProbe: probe }); // parity — lands on __stage2.lastReport too
    }
    return;
  }
}

/* ---------- Task A 2026-11-10: the measured shell witness + the #warn sample ----------
 * shellRemoved used to be the unconditional literal `true` in the dressing probe report —
 * a tautology (defect class: false green; it could never fail). It is now MEASURED off the
 * live scene graph: ANY wireframe-material Mesh OR Line/LineSegments at arena-shell scale
 * fails the witness, so a shell existing again (even hidden — traverse does not skip
 * invisible objects) turns the harness assert red. The removed boundary shell (story 7.6)
 * was IcosahedronGeometry(78, 2) wireframe; a grep of src/ (2026-11-10) shows ZERO wireframe
 * materials and ZERO line-class geometry in the game, and the largest legitimate scene
 * objects are single-digit u, so the ≥ 40 u floor cannot false-positive on live geometry.
 * Review finding 3 (Task A follow-up, 2026-11-10): the first cut witnessed only o.isMesh —
 * a shell reintroduced as LineSegments/Line (isLine: no wireframe flag exists on line
 * materials, and a line cage is the MOST natural future boundary shape) evaded it. The
 * class is closed: isLine || isLineSegments fails on the same radius floor.
 * MUTATION-PROVEN 2026-11-10:
 *   (a) a wireframe IcosahedronGeometry(78, 2) MESH re-added to the scene during this probe
 *       → shellRemoved measured FALSE → flow-check RED 'boundary wireframe shell removed
 *       (story 7.6)'; restored → green.
 *   (b) the same shell re-added as THREE.LineSegments (a Line, not a Mesh) during this
 *       probe → shellRemoved measured FALSE → the same assert RED for that reason;
 *       restored → green. (build/flow-taskA-baseline.txt holds the original green; the red
 *       transcripts were read from the mutation runs.) */
const SHELL_SCAN_MIN_R = 40; // u — shell-scale floor (the shell was 78; legit meshes ≤ ~single-digit u)
function shellScan(scene) {
  if (!scene) return false; // absent scene → honest red (absence must never read as a green witness)
  let shellFound = false;
  scene.traverse((o) => {
    if (shellFound) return;
    const isMesh = o.isMesh === true;
    const isLine = o.isLine === true || o.isLineSegments === true; // review finding 3: the line classes close the evasion (no wireframe flag exists there — the class itself is the witness)
    if (!isMesh && !isLine) return;
    if (isMesh) { // meshes witness only on a wireframe material; lines witness on the class alone
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let wire = false;
      for (let i = 0; i < mats.length; i++) { if (mats[i] && mats[i].wireframe) { wire = true; break; } }
      if (!wire) return;
    }
    if (!o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); // one-shot probe report path, NOT a tick path
    const r = o.geometry.boundingSphere ? o.geometry.boundingSphere.radius : 0;
    if (r >= SHELL_SCAN_MIN_R) shellFound = true; // a shell-scale wireframe mesh / line cage — the shell is back
  });
  return !shellFound;
}

// the #warn element's live render state (combat.js steer writes it every tick from r3)
function warnSample(C, arenaY) {
  const w = C.ui && C.ui.warn;
  if (!w) return null; // element-absent build → honest red (the assert reads the null)
  return {
    r3: +Math.hypot(C.pos.x, C.pos.y - arenaY, C.pos.z).toFixed(2), // the measured park radius — provenance for the assert
    visible: w.hidden !== true,
    text: w.textContent || '',
    danger: w.classList.contains('danger'),
  };
}
