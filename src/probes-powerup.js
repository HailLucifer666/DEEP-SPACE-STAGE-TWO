// STAGE TWO — story-018 POWERUP probe drive (review-fix split, story-018 review round): one walk
// per file — this module owns ?powerupProbe=1 and NOTHING else. VERBATIM move from src/probes.js
// (the R-e discipline): same statements, same order, same comments — zero behavior change. The
// helpers shared with the charge walk live in probes-common.js. Import rule unchanged: probes
// never import combat.js — the tick receives combat state + the pure helpers/constants as
// arguments; plain state lives HERE and resets via resetPowerupProbe() (probes.js resetProbes
// calls it on every combat enter).
import * as ENEMIES from './enemies.js';
import * as BOSS from './boss.js';
import * as POWERUPS from './powerups.js'; // story-018: forceDropForProbe + eachAlive + stats + createdCount for the pickup walk (acyclic — powerups never imports probes/combat)
import { cpFieldClear, cpPin } from './probes-common.js';

const qs = new URLSearchParams(location.search);
const POWERUP_PROBE = qs.get('powerupProbe') === '1'; // story-018: deterministic pickup/effect walk

const PU = {
  t: -1, stage: 0, mark: 0, sub: 0, done: false,
  stats0: null, kinds0: null, kills: 0, dropsMark: 0, target: null,
  rate: null, kinds: null, despawn: null, radius: null, spread: null, overdrive: null,
  shield: null, refresh: null, boss: null, drop: null, mark2: 0, lastT: null, bolt: null, odFrames: 0, odDt: 0,
  upVec: null, baselineEntities: 0, baselinePickups: 0, shotTimes: [], lastCount: 0,
};

export function resetPowerupProbe() { // moved verbatim from resetProbes (review-fix split): this walk's state bag + report + the debug stage surface — stale-delete hygiene
  Object.assign(PU, {
    t: -1, stage: 0, mark: 0, sub: 0, done: false,
    stats0: null, kinds0: null, kills: 0, dropsMark: 0, target: null,
    rate: null, kinds: null, despawn: null, radius: null, spread: null, overdrive: null,
    shield: null, refresh: null, boss: null, drop: null, mark2: 0, lastT: null,
    baselineEntities: 0, baselinePickups: 0, shotTimes: [], lastCount: 0,
    bolt: null, odFrames: 0, odDt: 0, upVec: null,
  });
  delete window.__stage2.powerupProbe;
  delete window.__stage2.puStage; // the debug stage surface (written every drive tick) — stale-delete hygiene
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
        PU.baselinePickups = POWERUPS.createdCount(); // review fix 2026-11-06: REAL pickup allocations so far — at this point ONLY the pre-warm has run, so this IS the prepare-time entity-baseline delta (the harness pins it at exactly 6; the old spawn+kill loop read 1)
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
        PU.target = null; PU.bolt = null;
        POWERUPS.clearPowerups();
        PU.kinds0 = POWERUPS.stats();
        PU.kills = 0; PU.mark2 = PU.t; PU.stage = 2; // mark2 re-arms as stage 2's watchdog
      }
      return;
    case 2: // the uniform 1/3 kind split over M = 300 REAL DROPS (not rolls — 300 rolls at p=0.18
      // yields only ~54 drops and the per-kind binomial band assumes M drops; 10 rolls/tick keeps
      // the frame honest; ~1670 rolls ≈ 3 s at the 18% rate)
      for (let i = 0; i < 10; i++) {
        env.forward(C.tmp);
        POWERUPS.maybeDrop(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 8));
      }
      if (POWERUPS.stats().dropped - PU.kinds0.dropped >= 300 || (PU.mark2 && PU.t > PU.mark2 + 40)) {
        // watchdog (mutation 2 proven need): with the drop roll removed, dropped never grows and
        // the stage would hang — the 40 s cap records honestly (kinds under-collected + timeout)
        // so the downstream asserts read by VALUE
        const s = POWERUPS.stats();
        PU.kinds = {
          SPREAD: s.byKind.SPREAD - PU.kinds0.byKind.SPREAD,
          OVERDRIVE: s.byKind.OVERDRIVE - PU.kinds0.byKind.OVERDRIVE,
          SHIELD: s.byKind.SHIELD - PU.kinds0.byKind.SHIELD,
          drops: s.dropped - PU.kinds0.dropped, // the ACTUAL drop count (the 10-per-tick loop overshoots 300 by ≤ 10)
        };
        if (PU.kinds.drops < 300) PU.kinds.timeout = true;
        PU.mark2 = 0;
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
    case 35: { // the rate window with the boss alive (or the timeout's cleanup path — honest fields).
      // NOTE: ANY continuous hold is suppression-capped at T_CHARGE 0.6 s → ~10-11 shots max
      // (the charged shot's own design) — the window stays 0.5 s and the band absorbs DT_CLAMP
      // stalls (observed 7-10 at headless 30-50 fps; a missing OVERDRIVE reads ~4-5 → red).
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
          boss: PU.boss, baselineEntities: PU.baselineEntities, baselinePickups: PU.baselinePickups,
        };
        window.__stage2.powerupProbe = probe;
        C.api.report({ powerupProbe: probe }); // parity — lands on lastReport too
      }
      return;
    }
  }
}
