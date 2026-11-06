// STAGE TWO — story-019 BALANCE probe drive (one walk per file — the story-018 split
// precedent): this module owns ?balanceProbe=1 and NOTHING else. NEW code (the verbatim-move
// discipline does not apply to new walks), but the house rules hold: probes never import
// combat.js — the tick receives combat state + the pure helpers/constants as arguments
// (probeEnv); shared walk helpers live in probes-common.js; plain state lives HERE and
// resets via resetBalanceProbe() on every combat enter (probes.js delegates — stale-delete
// hygiene, report deleted with the state).
// What it walks (the stage's namesake):
//   elite variants — stats read off the REAL spawn path (HP ×3 / speedMult ×1.15 /
//     scale ×1.35 / amber retint on the per-instance trim+glow / contact r = R_RAIDER ×
//     ELITE_SCALE), the unconditional per-spawn reset pin (a former elite must never respawn
//     elite), the score ×2 through the REAL bolt-kill path, wave-3 zeros (below
//     ELITE_MIN_WAVE), and the real-roll rate inside the exact binomial 95% band for
//     p = ELITE_CHANCE over N = 50 spawns (NO seeded RNG exists — architecture §7.1 honest
//     flag; widen trials, never bounds);
//   the waves 1-5 composition table — observed through the REAL spawn path (startWave per
//     wave, every spawned raider counted by object identity), the authored deterministic
//     split per row, totals equal to the derived waveCount, and the boundary BOTH ways
//     (wave 5 source 'table', wave 6 source 'derived');
//   the telemetry scripted run — real-fire stream kill of a rammer + a charged one-shot of a
//     gunner (shots/hits/kills/scoreBy deltas match the drive's own actions);
//   the locked boss reward — pre-boss score + SCORE_BOSS exactly once through the REAL
//     bossApi.report wrapper, then a FORCED second completion through the same wrapper: the
//     C.bossAwarded latch must hold (score unchanged), the report counter stays countable.
// The drive grew with the story's commits (A boss reward → B elites → C tables → D
// telemetry); every commit's harness stayed green, and the red-first record was captured
// once on the gate build with the full harness.
import * as ENEMIES from './enemies.js';
import * as BOSS from './boss.js';
import { cpFieldClear, cpPin } from './probes-common.js';

const qs = new URLSearchParams(location.search);
const BALANCE_PROBE = qs.get('balanceProbe') === '1'; // story-019: elite/table/telemetry/boss-reward walk

const BL = {
  t: -1, stage: 0, mark: 0, done: false,
  elite: { gunner: null, rammer: null }, resetPin: null, scoreX2: null,
  wave3: null, w3Left: 0, w3Elites: 0,
  rate: null, rateLeft: 0, rateElites: 0,
  table: null, tw: 1, seen: null, rowKinds: null, rows: {}, waveCounts: [], w6: null, tableWait: 0,
  marks: null, rammerKill: null, chargedKill: null, firedChargedMark: 0,
  x2Marks: null, x2Target: null,
  boss: null, preScore: 0, preReports: 0, highscore: null,
};

export function resetBalanceProbe() { // probes.js resetProbes delegates (the story-018 split's call order — last)
  Object.assign(BL, {
    t: -1, stage: 0, mark: 0, done: false,
    elite: { gunner: null, rammer: null }, resetPin: null, scoreX2: null,
    wave3: null, w3Left: 0, w3Elites: 0,
    rate: null, rateLeft: 0, rateElites: 0,
    table: null, tw: 1, seen: null, rowKinds: null, rows: {}, waveCounts: [], w6: null, tableWait: 0,
    marks: null, rammerKill: null, chargedKill: null, firedChargedMark: 0,
    x2Marks: null, x2Target: null,
    boss: null, preScore: 0, preReports: 0, highscore: null,
  });
  delete window.__stage2.balanceProbe; // a fresh combat must never inherit the previous walk's report
}

function readElite(d, bases) { // the probe's elite readout — the exact userData fields the harness asserts
  const u = d.userData;
  return {
    kind: u.kind, elite: u.elite, hp: u.hp, speedMult: u.speedMult,
    scale: +d.scale.x.toFixed(4), r: +u.r.toFixed(4),
    trimTint: u.trim.emissive.getHex(), glowTint: u.glow.color.getHex(),
    ...(bases || {}),
  };
}

function freezeShip(C) { // probe-owned precondition (charge/pitch probe precedent): no steering interference
  C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0; C.heading = 0;
  C.api.input.mouseActive = false;
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'Space']) C.api.input.keys.delete(k);
}

function noseSeat(C, env, out) { // a point ON the fire ray 3 u from the nose — the bolt scan's guaranteed-hit seat (charge-probe boltTargetSeat pattern: a ship-center seat sits 1.0 u off the ray)
  env.noseWorld(C.tmp2);
  env.forward(C.tmp);
  return out.copy(C.tmp2).addScaledVector(C.tmp, 3);
}

const SEAT = (C) => C.tmp2.set(C.pos.x + 10, C.pos.y, C.pos.z); // a fixed off-nose seat for spawn/read/kill churn

function latchBalance(C) { // the report latch — shared by the completion path and the boss stages' 5 s watchdogs (quality review 2026-11-07: every wait stage is bounded)
  BL.done = true;
  const probe = {
    elite: BL.elite, resetPin: BL.resetPin, scoreX2: BL.scoreX2,
    wave3: BL.wave3, rate: BL.rate, table: BL.table,
    telemetry: { rammerKill: BL.rammerKill, chargedKill: BL.chargedKill },
    boss: BL.boss, highscore: BL.highscore,
  };
  window.__stage2.balanceProbe = probe;
  window.__stage2.balanceProbeLive = false;
  C.api.report({ balanceProbe: probe }); // parity with scriptedKill/droneProbe — lands on lastReport too
}

export function balanceProbeTick(dt, C, env) {
  if (!BALANCE_PROBE || BL.done) return;
  BL.t += dt;
  cpPin(C, true); // wave pinned 1 with a 99 s gap — wavesTick can never fire under the drive (probes run last in tickCombat)
  window.__stage2.balanceProbeLive = true;

  switch (BL.stage) {
    case 0: // settle, then freeze + clear the entry wave
      if (BL.t >= 0.4) {
        cpFieldClear(C); freezeShip(C);
        BL.stage = 1;
      }
      return;
    case 1: { // base tints from a NORMAL spawn (the reset pin's expected values), then elite stats via the forced seam (forceKind pins the per-kind asserts — the base hp stamps before the elite multiply)
      const n = ENEMIES.spawnRaiderForProbe(SEAT(C), 1, false, 'gunner');
      const bases = { trimBase: n.userData.trim.emissive.getHex(), glowBase: n.userData.glow.color.getHex() };
      ENEMIES.hitDrone(n, 99);
      const g = ENEMIES.spawnRaiderForProbe(SEAT(C), 4, true, 'gunner');
      BL.elite.gunner = readElite(g, bases);
      ENEMIES.hitDrone(g, 99);
      const r = ENEMIES.spawnRaiderForProbe(SEAT(C), 4, true, 'rammer');
      BL.elite.rammer = readElite(r, bases);
      ENEMIES.hitDrone(r, 99);
      BL.stage = 2;
      return;
    }
    case 2: { // the reset pin: kill a forced elite, respawn at wave 3 (the roll cannot fire there) — the reused pool slot must read normal (the kind is the real roll; the assert reads hp against whatever kind came back)
      const e = ENEMIES.spawnRaiderForProbe(SEAT(C), 4, true, 'gunner');
      ENEMIES.hitDrone(e, 99); // pool.js spawn() is reuse-first — the next spawn hands back the SAME instance
      const n = ENEMIES.spawnRaiderForProbe(SEAT(C), 3, false);
      BL.resetPin = { after: readElite(n) };
      ENEMIES.hitDrone(n, 99);
      BL.stage = 3;
      return;
    }
    case 3: // elite score ×2 — through the REAL bolt-kill site. The killing bolts are PROBE
      // BOLTS re-seated 0.2 u behind the pinned target every tick (the powerup drive's proven
      // pattern: a free 42 u/s bolt at headless fps teleports 0.7-2.9 u per frame and can
      // straddle the ±1.05 hit window — a natural 6-hit stream volley is not deterministic
      // here; the single-hit telemetry stages below ARE and carry the real-fire counters).
      // The kill SITE is the real one — score/kills/telemetry increment exactly as on a
      // player-killed elite (an unstamped probe bolt reads dmg 1 — six deterministic ticks).
      cpFieldClear(C);
      BL.x2Marks = {
        score: C.score, kills: C.kills,
        tKillsGunner: C.telemetry.kills.gunner, tEliteGunner: C.telemetry.eliteKills.gunner,
      };
      BL.x2Target = ENEMIES.spawnRaiderForProbe(noseSeat(C, env, C.tmp2), 4, true, 'gunner'); // the ×2 anchor is the elite GUNNER (150 × 2 = 300)
      BL.x2Target.userData.hp = 6; // belt-and-braces: a real elite gunner's hp (2 × ELITE_HP_MULT)
      BL.x2Target.userData.fireT = 999; // probe-owned precondition (pitch-probe precedent): the seeded gunner never shoots mid-measurement
      BL.mark = BL.t; BL.stage = 4;
      return;
    case 4: // re-pin the target on the fire ray + deliver one probe bolt per tick (1 dmg each — six ticks kill)
      if (BL.x2Target) {
        noseSeat(C, env, BL.x2Target.position);
        if (!BL.x2Target.userData.alive) {
          BL.scoreX2 = {
            scoreDelta: C.score - BL.x2Marks.score, killsDelta: C.kills - BL.x2Marks.kills,
            tKillsGunner: C.telemetry.kills.gunner - BL.x2Marks.tKillsGunner,
            tEliteGunner: C.telemetry.eliteKills.gunner - BL.x2Marks.tEliteGunner,
          };
          BL.x2Target = null; BL.stage = 5;
        } else if (BL.t > BL.mark + 8) {
          BL.scoreX2 = {
            scoreDelta: C.score - BL.x2Marks.score, killsDelta: C.kills - BL.x2Marks.kills,
            tKillsGunner: C.telemetry.kills.gunner - BL.x2Marks.tKillsGunner,
            tEliteGunner: C.telemetry.eliteKills.gunner - BL.x2Marks.tEliteGunner,
            timeout: true,
          };
          ENEMIES.hitDrone(BL.x2Target, 99); BL.x2Target = null; BL.stage = 5;
        } else {
          const b = C.bolts.spawn(); // a fresh probe bolt each tick — the scan kills it on contact (the pool reuses the slot)
          env.forward(C.tmp);
          b.position.copy(BL.x2Target.position).addScaledVector(C.tmp, -0.2);
          b.userData.dir.copy(C.tmp);
          b.userData.life = env.BOLT_LIFE;
          b.lookAt(C.tmp2.copy(b.position).add(b.userData.dir));
        }
      }
      return;
    case 5: BL.w3Left = 20; BL.w3Elites = 0; BL.stage = 6; return;
    case 6: { // wave-3 zero-elites: 20 REAL spawns below ELITE_MIN_WAVE — the roll cannot fire
      if (BL.w3Left > 0) {
        const d = ENEMIES.spawnRaiderForProbe(SEAT(C), 3, false);
        if (d.userData.elite) BL.w3Elites++;
        ENEMIES.hitDrone(d, 99);
        BL.w3Left--;
        return;
      }
      BL.wave3 = { spawns: 20, elites: BL.w3Elites };
      BL.stage = 7;
      return;
    }
    case 7: BL.rateLeft = 50; BL.rateElites = 0; BL.stage = 8; return;
    case 8: { // the rate: 50 REAL rolls at wave 5 (p = ELITE_CHANCE 0.22) — one spawn/read/kill per tick
      if (BL.rateLeft > 0) {
        const d = ENEMIES.spawnRaiderForProbe(SEAT(C), 5, false);
        if (d.userData.elite) BL.rateElites++;
        ENEMIES.hitDrone(d, 99);
        BL.rateLeft--;
        return;
      }
      BL.rate = { rolls: 50, elites: BL.rateElites };
      BL.stage = 9; // on to the waves 1-5 composition table
      return;
    }
    case 9: // the table walk, wave tw: start through the REAL spawn path and observe the kinds
      if (BL.tw > 6) { BL.table = { rows: BL.rows, waveCounts: BL.waveCounts, w6: BL.w6 }; BL.stage = 14; return; }
      cpFieldClear(C);
      ENEMIES.startWave(BL.tw, C.pos); // the REAL path — the table budget drains gunner-first (waves 1-5) or rammerShare rolls (6)
      BL.seen = new Map(); BL.rowKinds = { gunner: 0, rammer: 0 }; BL.tableWait = 0;
      BL.stage = 10;
      return;
    case 10: { // count SPAWN EVENTS — not distinct objects: a mid-wave ram death frees a pool
      // slot and the next spawn REUSES the same object, so an identity set would undercount
      // (observed: wave 6 read 11 of 12). Prune dead objects first, then anything alive that
      // the previous tick did not see is a NEW spawn and counts its kind.
      for (const d of [...BL.seen.keys()]) { if (!d.userData.alive) BL.seen.delete(d); }
      ENEMIES.eachAlive((d) => {
        if (!BL.seen.has(d)) { BL.rowKinds[d.userData.kind === 'gunner' ? 'gunner' : 'rammer']++; BL.seen.set(d, d.userData.kind); }
      });
      BL.tableWait += dt;
      const total = ENEMIES.waveCount(BL.tw);
      const spawned = BL.rowKinds.gunner + BL.rowKinds.rammer;
      if (spawned >= total || BL.tableWait > 14) {
        BL.rows[BL.tw] = { gunner: BL.rowKinds.gunner, rammer: BL.rowKinds.rammer, total: spawned, source: ENEMIES.waveComposition(BL.tw).source };
        BL.waveCounts.push(total);
        if (BL.tw === 6) BL.w6 = BL.rows[6]; // the boundary wave gets its own record (the harness asserts it both ways)
        ENEMIES.eachAlive((d) => ENEMIES.hitDrone(d, 99)); // release the field for the next wave
        BL.tw++;
        BL.stage = 9;
      }
      return;
    }
    case 14: // telemetry scripted run — the STREAM kill (real fire only: shots, hits, kills and scoreBy all come from the same real path, so hits ≤ shots holds globally on this drive)
      cpFieldClear(C);
      BL.marks = {
        shotsStream: C.telemetry.shots.stream, hitsStream: C.telemetry.hits.stream,
        killsRammer: C.telemetry.kills.rammer, scoreRammer: C.telemetry.scoreBy.rammer,
      };
      BL.x2Target = ENEMIES.spawnRaiderForProbe(noseSeat(C, env, C.tmp2), 1, false, 'rammer');
      BL.x2Target.userData.hp = 1; // probe-owned stamp: one stream hit kills
      C.api.input.fire = true;
      BL.mark = BL.t; BL.stage = 15;
      return;
    case 15: // re-pin on the fire ray; the first stream hit kills the 1-hp rammer
      if (BL.x2Target) {
        noseSeat(C, env, BL.x2Target.position);
        const dead = !BL.x2Target.userData.alive, timeout = BL.t > BL.mark + 8;
        if (dead || timeout) {
          C.api.input.fire = false;
          if (timeout) ENEMIES.hitDrone(BL.x2Target, 99);
          BL.rammerKill = {
            shotsStream: C.telemetry.shots.stream - BL.marks.shotsStream,
            hitsStream: C.telemetry.hits.stream - BL.marks.hitsStream,
            killsRammer: C.telemetry.kills.rammer - BL.marks.killsRammer,
            scoreRammer: C.telemetry.scoreBy.rammer - BL.marks.scoreRammer,
            ...(timeout ? { timeout: true } : {}),
          };
          BL.x2Target = null; BL.stage = 16;
        }
      }
      return;
    case 16: // the CHARGED kill: hold past the threshold — the pre-suppression stream bolts hit nothing (field clear), then release
      cpFieldClear(C);
      BL.marks = {
        shotsCharged: C.telemetry.shots.charged, hitsCharged: C.telemetry.hits.charged,
        killsGunner: C.telemetry.kills.gunner, chargedKills: C.telemetry.chargedKills, scoreGunner: C.telemetry.scoreBy.gunner,
        firedCharged: C.fired.charged,
      };
      C.api.input.fire = true; BL.mark = BL.t; BL.stage = 17;
      return;
    case 17: // hold 0.7 s (past T_CHARGE 0.6 — stream suppressed), then release
      if (BL.t >= BL.mark + 0.7) { C.api.input.fire = false; BL.stage = 18; }
      return;
    case 18: // the charged bolt is in flight — seed the gunner NOW (the pre-threshold stream bolts are beyond the 3 u seat — charge-probe precedent), then wait for the one-shot
      if (C.fired.charged > BL.marks.firedCharged) {
        BL.x2Target = ENEMIES.spawnRaiderForProbe(noseSeat(C, env, C.tmp2), 1, false, 'gunner');
        BL.x2Target.userData.hp = 2; // a real gunner's hp — the charged bolt (dmg 6) one-shots
        BL.x2Target.userData.fireT = 999;
        BL.mark = BL.t; BL.stage = 19;
      } else if (BL.t > BL.mark + 3) { BL.chargedKill = { timeout: true }; BL.stage = 19; }
      return;
    case 19: // re-pin; the charged bolt catches the target on the ray
      if (BL.x2Target) {
        noseSeat(C, env, BL.x2Target.position);
        const dead = !BL.x2Target.userData.alive, timeout = BL.t > BL.mark + 8;
        if (dead || timeout) {
          if (timeout) ENEMIES.hitDrone(BL.x2Target, 99);
          BL.chargedKill = {
            shotsCharged: C.telemetry.shots.charged - BL.marks.shotsCharged,
            hitsCharged: C.telemetry.hits.charged - BL.marks.hitsCharged,
            killsGunner: C.telemetry.kills.gunner - BL.marks.killsGunner,
            chargedKills: C.telemetry.chargedKills - BL.marks.chargedKills,
            scoreGunner: C.telemetry.scoreBy.gunner - BL.marks.scoreGunner,
            ...(timeout ? { timeout: true } : {}),
          };
          BL.x2Target = null; BL.stage = 20;
        }
      }
      return;
    case 20: // boss completion — the locked reward through the REAL wrapper (pre-boss score is deterministic: the field is clear, the alive boss blocks waves, nothing else scores)
      cpFieldClear(C);
      BL.preScore = C.score;
      BL.preReports = window.__stage2.bossDefeatedReports || 0;
      env.forward(C.tmp);
      BOSS.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 20).setY(env.ARENA_Y));
      BL.mark = BL.t; BL.stage = 21;
      return;
    case 21: // wait for the boss entity, then kill it — the 5 s watchdog keeps the wait bounded (the other stages' convention; quality review 2026-11-07)
      if (BL.t >= BL.mark + 0.3 && BOSS.state()) { BOSS.probeDamage(BOSS.state().hp, C.api); BL.mark = BL.t; BL.stage = 22; }
      else if (BL.t > BL.mark + 5) {
        BL.boss = { timeout: true, preScore: BL.preScore, reports: window.__stage2.bossDefeatedReports || 0, bossAwarded: !!C.bossAwarded, finalScore: C.score };
        latchBalance(C);
      }
      return;
    case 22: // the death cinematic runs ~1.2 s real; the completion frame runs the wrapper (award + go('victory') + clearCombat) BEFORE this drive tick — one frame is all the drive needs. 5 s watchdog: the asserts record the timeout honestly
      if ((window.__stage2.bossDefeatedReports || 0) > BL.preReports) {
        const scoreAfter = C.score;
        const bossAwarded = C.bossAwarded;
        C.bossApi.report({ bossDefeated: { forced: true } }); // the FORCED second completion — the latch must hold the score
        BL.boss = {
          preScore: BL.preScore, scoreAfter, scoreAfter2: C.score,
          reports: window.__stage2.bossDefeatedReports || 0, bossAwarded, finalScore: C.score,
        };
        BL.highscore = window.__stage2.highscore; // victory.enter's writeHighscore already ran with the +1000
        latchBalance(C);
      } else if (BL.t > BL.mark + 5) {
        BL.boss = { timeout: true, preScore: BL.preScore, reports: window.__stage2.bossDefeatedReports || 0, bossAwarded: !!C.bossAwarded, finalScore: C.score };
        latchBalance(C);
      }
      return;
  }
}
