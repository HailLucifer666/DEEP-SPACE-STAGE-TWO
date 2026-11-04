// STAGE TWO — COMBAT CORE (S4): chase-cam space combat around the hero rocket.
// Owns: player ship pose (re-parents the rocket into a yaw/pitch/roll pose group),
// throttle+turn flight (W/S throttle, A/D + pointer steer — no pointer lock),
// soft-clamped arena, hold-fire pooled bolts,
// shield→HP damage with regen, boost meter, derived waves (via enemies.js), death
// slow-mo handoff. Contained state contract (§8.6): clearCombat() re-parents the
// rocket, drains every pool and resets all flags — restarts allocate nothing new.
import { THREE } from 'stage-two-lib';
import * as ENEMIES from './enemies.js';
import * as DRONES from './drone.js';
import * as BOSS from './boss.js';
import { BOSS_WAVE } from './boss.js';
import * as EFFECTS from './effects.js';
import { makePool } from './pool.js';
import { beep, sweep, noiseBurst, loopStart, musicEvict, musicSetDuck, alarmTick, proximityTick } from './audio.js';
import { stageShip, combatFlow } from './launch.js';

const ARENA_Y = 18;
// Sector boundary (story-005): a soft circular rim. Inside R_SOFT flight is untouched; from
// R_SOFT to R_HARD the outward radial speed bleeds toward zero (tangential preserved — the ship
// slides along the rim instead of pinning), and the rim renders as a visible ground ring. The
// old hard ±80 square pinned the ship at full thrust over streaming ground — the "stuck at the
// edge" report, twice (the ±80 was itself a 3x enlargement for the same symptom). Raiders spawn
// 55 off the player, so R_HARD 80 keeps the spawn ring off-camera.
const R_SOFT = 60, R_HARD = 80;
const MAX_SPEED = 17;        // bumped with the arena — same crossing time as the old 26 arena at 14
const BOOST_MULT = 1.9;
const TURN_RATE = 2.2;       // commanded yaw (rad/s) — full circle ≈ 3 s (story-004: heading is player-owned)
const ACCEL = 14;            // W: u/s² toward the cruise/boost ceiling
const BRAKE = 22;            // S: u/s² down to 0 — brakes harder than W accelerates, and S wins over W
const FIRE_INTERVAL = 1 / 8; // ~8/s hold-fire
const BOLT_SPEED = 42;
const BOLT_LIFE = 1.2;
const BOLT_POOL = 24;
const HP_MAX = 100, SHIELD_MAX = 50, SHIELD_REGEN_DELAY = 3, SHIELD_REGEN_RATE = 14;
const DEATH_SLOWMO = 0.7;    // seconds of real time at timeScale 0.3 before gameover (a click lands it sooner)
const SCORE_DRONE = 100, SCORE_GUNNER = 150, SCORE_WAVE = 150;
// story-012: the Vi3W drone's kill score. SCORE_DRONE above is the RAIDERS' historical rammer
// score — the name collision is pre-existing (enemies.js hitDrone/droneRadius too); those
// names stay untouched per the story. The new enemy's kind is 'orb', its score lives here.
const SCORE_ORB = 200;

const C = {
  ready: false, scene: null, camera: null, rocket: null, ui: null, api: null,
  pose: null, tilt: null,
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), heading: 0, bank: 0, speed: 0, // speed = throttle state (u/s along the nose); heading is player-commanded (story-004)
  hp: HP_MAX, shield: SHIELD_MAX, regenT: 0, dead: false, deathT: 0,
  fireT: 0, boost: 1, boosting: false,
  wave: 0, waveGapT: 0, score: 0, kills: 0,
  bed: null, scriptT: -1, scriptDone: false,
  // story-012 drone probe state (?droneProbe=1) — probe-only fields, untouched by normal play
  dpT: -1, dpDrone: null, dpWin: 0, dpDone: false,
  dpTele: false, dpDive: false, dpContact: false, dpSamples: 0, dpMM: null,
  // story-013 boss probe state (?bossProbe=1) — probe-only fields, untouched by normal play
  bossApi: null, bpT: -1, bpStage: 'spawn', bpStageT: 0, bpFired: 0, bpHpMark: 0,
  bpSpawnWave: 0, bpHud: false, bpCharged: false, bpRaged: false, bpRagePinned: false, bpKilled: false, bpDone: false,
  tmp: new THREE.Vector3(), tmp2: new THREE.Vector3(),
  ndc: new THREE.Vector3(), // hoisted unproject scratch (feel: no per-frame allocation)
  flow: 0, // smoothed boost → field-flow factor (0 idle drift, 1 rush)
  proxScanT: 0, nearest: null, // story-009: nearest-hostile scan gate (≤ every 0.15 s) + last result (spec §5)
  rim: null, // story-005: the visible sector-edge ring (created once, opacity driven by proximity)
  pips: [], pipDir: new THREE.Vector3(), pipFwd: new THREE.Vector3(), pipInv: new THREE.Quaternion(),
  retX: -1, retY: -1, lastBars: null, lastScore: null, // change-gates for DOM writes
};
const qs = new URLSearchParams(location.search);
const SCRIPTED_KILL = qs.get('scriptedKill') === '1';
const DRONE_PROBE = qs.get('droneProbe') === '1'; // story-012: deterministic single-drone run
const BOSS_PROBE = qs.get('bossProbe') === '1'; // story-013: deterministic boss walk (skips the wave-5 wait)
const BOSS_SHOT = qs.get('bossShot') === '1'; // story-013 evidence variant: closer spawn + phase holds (screenshots)

const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a)); // NaN-safe (§8.9)
const fmt = (n) => (Number.isFinite(n) ? String(Math.max(0, Math.floor(n))) : '0'); // honest HUD values (spec #16)

function makeBolt() {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.09, 1.7),
    new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.userData.dir = new THREE.Vector3();
  m.userData.life = 0;
  return m;
}

export function prepareCombat(scene, camera, rocket, ui, api) {
  if (C.ready) return;
  Object.assign(C, { scene, camera, rocket, ui, api, ready: true });
  // pose group: yaw (heading) → fixed pitch lays the nose horizontal → roll (bank)
  C.pose = new THREE.Group();
  C.pose.rotation.order = 'YXZ';
  C.tilt = new THREE.Group();
  C.tilt.rotation.x = Math.PI / 2; // +Y nose → +Z forward
  C.pose.add(C.tilt);
  scene.add(C.pose);
  C.bolts = makePool(scene, makeBolt, BOLT_POOL);
  EFFECTS.prepareEffects(scene, camera);
  ENEMIES.prepareEnemies(scene);
  DRONES.prepareDrones(scene); // story-012: orbs join the wave layer; GLB decode starts here if inlined
  BOSS.prepareBoss(scene); // story-013: the single-entity boss joins the scene at prepare (baseline-stable mesh count)
  C.bossApi = { // the boss's tick/death api — EFFECTS + the combat probe surfaces, drone-tick api shape extended for slow-mo + report
    damagePlayer, explosion: (p) => EFFECTS.explosion(p), shake: (a) => EFFECTS.shake(a),
    setTimeScale: (v) => C.api.setTimeScale(v), getTimeScale: () => C.api.getTimeScale(),
    report: (r) => C.api.report(r),
  };
  // edge pips (J) — off-screen raider awareness; created once, #hud hides them outside combat
  if (C.ui.hud && !C.pips.length) {
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div');
      p.style.cssText = 'position:absolute;left:0;top:0;width:14px;height:14px;opacity:0;' +
        'background:#ff5a3c;clip-path:polygon(50% 0, 100% 78%, 78% 100%, 22% 100%, 0 78%);' +
        'filter:drop-shadow(0 0 6px rgba(255,90,60,.7));will-change:transform,opacity;';
      C.ui.hud.appendChild(p);
      C.pips.push(p);
    }
  }
}

/* ---------- ship ↔ world ---------- */
function reparentRocket(toPose) {
  const r = C.rocket;
  if (!r) return;
  if (toPose) {
    C.tilt.add(r);
    r.position.set(0, 0, 0);
    r.rotation.set(0, 0, 0);
  } else {
    stageShip(); // back to the launch rig — launch owns the seat (was a hardcoded pad spot)
  }
}

function noseWorld(out) {
  return C.rocket ? C.rocket.localToWorld(out.set(0, 1.0, 0)) : out.copy(C.pos);
}

function forward(out) {
  return out.set(Math.sin(C.heading), 0, Math.cos(C.heading));
}

/* ---------- input → steering (story-004: throttle + turn) ---------- */
function steer(dt) {
  const input = C.api.input;
  const keys = input.keys;

  // turn — the nose is player-owned now. Screen-right at heading 0 is world −x (camera basis
  // x = up × (−forward)), so left = +Δh, right = −Δh; the pointer steers the same axis and the
  // summed command is clamped so keys+mouse together can't spin past 1.25× TURN_RATE.
  const keyTurn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const mx = input.mouseActive && Math.abs(input.mouse.x) > 0.08 ? input.mouse.x : 0; // deadzone: a resting pointer must not creep
  const turn = clamp(keyTurn - mx, -1.25, 1.25);
  C.heading += turn * TURN_RATE * dt;

  // throttle — W accelerates toward cruise (boost raises the ceiling), S brakes to 0 and wins
  // over W; neither key holds speed (cruise). Space/Shift without W does nothing and doesn't
  // drain the meter. Boost expiry bleeds back down at brake rate even with W held (review R2:
  // the old else-if order snap-clamped 32→17 in one frame via Math.min).
  const wHeld = keys.has('KeyW') || keys.has('ArrowUp');
  const sHeld = keys.has('KeyS') || keys.has('ArrowDown');
  const boostWant = wHeld && !sHeld && (input.boost || keys.has('ShiftLeft') || keys.has('ShiftRight')) && C.boost > 0.12;
  C.boosting = boostWant;
  C.boost = clamp(C.boost + (boostWant ? -0.45 : 0.25) * dt, 0, 1);
  const maxSpeed = MAX_SPEED * (boostWant ? BOOST_MULT : 1);
  if (sHeld) C.speed = Math.max(0, C.speed - BRAKE * dt);
  else if (C.speed > maxSpeed) C.speed = Math.max(maxSpeed, C.speed - BRAKE * dt); // expiry bleed, never a snap
  else if (wHeld) C.speed = Math.min(maxSpeed, C.speed + ACCEL * dt);

  // the ship flies where the nose points — vel is derived from heading, never the reverse
  // (the old velocity-derived heading is what made W flip the camera 180°)
  C.vel.copy(forward(C.tmp)).multiplyScalar(C.speed);

  // soft circular rim (story-005): past R_SOFT the outward radial component bleeds toward zero
  // (tangential preserved — the ship slides along the rim instead of pinning against a wall)
  let r = Math.hypot(C.pos.x, C.pos.z);
  if (r > R_SOFT) {
    const nx = C.pos.x / r, nz = C.pos.z / r; // outward unit normal
    const radial = C.vel.x * nx + C.vel.z * nz;
    const cap = Math.max(3, MAX_SPEED * (R_HARD - r) / (R_HARD - R_SOFT)); // floor 3: bounded arrival — the linear cap alone is asymptotic (dr/dt ∝ (R_HARD−r)), which reads as mud at the rim
    if (radial > cap) {
      const excess = radial - cap;
      C.vel.x -= excess * nx; C.vel.z -= excess * nz;
    }
  }
  C.pos.addScaledVector(C.vel, dt);

  // hard circular clamp — safety net for the one frame the bleed cap allows
  r = Math.hypot(C.pos.x, C.pos.z);
  if (r > R_HARD) {
    const s = R_HARD / r;
    C.pos.x *= s; C.pos.z *= s;
    r = R_HARD;
  }
  if (C.ui.warn) {
    C.ui.warn.hidden = r <= R_SOFT || C.dead;
    C.ui.warn.textContent = 'EDGE OF SECTOR';
  }
  if (C.rim) C.rim.material.opacity = clamp((r - R_SOFT) / (R_HARD - R_SOFT), 0, 1) * 0.55;

  // bank reads the commanded turn — same visual sign as the old left-turn lean (right turn +)
  C.bank += (clamp(-turn * 0.7, -0.7, 0.7) - C.bank) * (1 - Math.exp(-7 * dt));
}

/* ---------- weapons ---------- */
function fireTick(dt) {
  const wantFire = C.api.input.fire;
  C.fireT -= dt;
  if (!wantFire || C.dead || C.fireT > 0) return;
  C.fireT = FIRE_INTERVAL;
  const b = C.bolts.spawn();
  noseWorld(b.position);
  forward(b.userData.dir);
  b.userData.life = BOLT_LIFE;
  b.lookAt(C.tmp.copy(b.position).add(b.userData.dir));
  sweep({ f0: 1500, f1: 320, dur: 0.09, vol: 0.12, type: 'square' });
}

function boltsTick(dt) {
  C.bolts.update(dt, (b) => {
    b.userData.life -= dt;
    b.position.addScaledVector(b.userData.dir, BOLT_SPEED * dt);
    if (b.userData.life <= 0) { C.bolts.kill(b); return; }
    // bolt × drone scan (both pools are small — brute force is the honest option)
    ENEMIES.eachAlive((d) => {
      if (!b.userData.alive) return;
      const dx = d.position.x - b.position.x, dz = d.position.z - b.position.z;
      if (dx * dx + dz * dz < 1.1) {
        C.bolts.kill(b);
        EFFECTS.explosion(d.position);
        noiseBurst({ dur: 0.28, vol: 0.4, f0: 900, f1: 140 });
        if (ENEMIES.hitDrone(d, 1)) {
          C.score += d.userData.kind === 'gunner' ? SCORE_GUNNER : SCORE_DRONE;
          C.kills++;
          EFFECTS.shake(0.06); // kill feedback (J)
          beep({ freq: 620, dur: 0.09, vol: 0.16, type: 'triangle' });
        }
      }
    });
    // bolt × orb scan (story-012) — FULL 3D distance: orbs fly altitudes, so the raiders' XZ
    // check would hit a drone a whole ring-tilt above the bolt (or miss one below it)
    DRONES.eachAlive((o) => {
      if (!b.userData.alive) return;
      const dx = o.position.x - b.position.x, dy = o.position.y - b.position.y, dz = o.position.z - b.position.z;
      if (dx * dx + dy * dy + dz * dz < DRONES.orbBoltR2()) {
        C.bolts.kill(b);
        EFFECTS.explosion(o.position);
        noiseBurst({ dur: 0.28, vol: 0.4, f0: 900, f1: 140 });
        if (DRONES.hitOrb(o, 1)) {
          C.score += SCORE_ORB;
          C.kills++;
          EFFECTS.shake(0.06);
          beep({ freq: 620, dur: 0.09, vol: 0.16, type: 'triangle' });
        }
      }
    });
    // bolt × boss scan (story-013) — the node zone outranks the hull band (boss.boltHit:
    // 2 = weak node, 1 = ring hull); WEAK_MULT applies inside hitBoss. The kill launches the
    // slow-mo death cinematic inside boss.js — no score/kills side-effects (spec is silent;
    // story-014 owns the victory rewards).
    if (b.userData.alive && BOSS.alive()) {
      const zone = BOSS.boltHit(b.position);
      if (zone) {
        C.bolts.kill(b);
        EFFECTS.explosion(b.position);
        noiseBurst({ dur: 0.3, vol: zone === 2 ? 0.5 : 0.4, f0: zone === 2 ? 1200 : 800, f1: 140 });
        if (BOSS.hitBoss(1, zone === 2, C.bossApi)) EFFECTS.shake(0.12);
      }
    }
  });
}

/* ---------- damage / death ---------- */
function damagePlayer(n) {
  if (C.dead) return;
  const toShield = Math.min(C.shield, n);
  C.shield -= toShield;
  const toHull = n - toShield;
  C.hp = Math.max(0, C.hp - toHull);
  C.regenT = 0;
  EFFECTS.hitVeil(260);
  EFFECTS.shake(0.16);
  noiseBurst({ dur: 0.3, vol: 0.5, f0: 260, f1: 90 });
  if (C.hp <= 0) {
    C.dead = true;
    C.deathT = 0;
    C.api.setTimeScale(0.3); // death slow-mo (spec §in-scope)
    EFFECTS.shake(0.45);
    noiseBurst({ dur: 1.1, vol: 0.8, f0: 700, f1: 60 });
  }
}

/* ---------- waves ---------- */
function wavesTick(dt) {
  if (C.dead) return;
  // story-012: orbs join the wave-clear condition — the wave doesn't advance while a drone
  // orbits (ENEMIES.startWave's pure raider formula is untouched; drones ride the wave layer).
  // story-013: the boss blocks it too while alive, and spawns ONCE instead of wave BOSS_WAVE+1
  // (the spawn-once latch lives in boss.js — eligible(); until story-014's victory card the
  // waves simply continue after the boss dies).
  if (ENEMIES.aliveCount() === 0 && ENEMIES.queuedCount() === 0 &&
      DRONES.aliveCount() === 0 && DRONES.queuedCount() === 0 && !BOSS.alive()) {
    if (C.waveGapT <= 0) { C.waveGapT = 1.6; if (C.wave > 0) C.score += SCORE_WAVE * C.wave; }
    C.waveGapT -= dt;
    if (C.waveGapT <= 0) {
      C.waveGapT = 0; C.wave++;
      if (C.wave > BOSS_WAVE && BOSS.eligible()) BOSS.spawnBoss(C.pos); // story-013: the warden arrives
      else { ENEMIES.startWave(C.wave, C.pos); DRONES.startWave(C.wave); }
    }
  }
}

/* ---------- scripted kill probe (?scriptedKill=1) ----------
 * Mutation-tested 2026-11-02: seen RED before the fix (bolt dir negated → bolt flew
 * away from the drone; probe read kills 0 / score 150, no lastReport kill), GREEN after
 * (kills 1, score +100, particles 12). It fails loudly when bolts stop killing. */
function scriptedKillTick(dt) {
  if (!SCRIPTED_KILL || C.scriptDone) return;
  C.scriptT += dt;
  if (C.scriptT >= 0.4 && !C.scriptDrone) {
    forward(C.tmp);
    const d = ENEMIES.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 9));
    C.scriptDrone = d;
  }
  if (C.scriptT >= 0.55 && C.scriptDrone && C.scriptDrone.userData.alive) {
    // one bolt from behind the seeded drone, flying into it along +forward
    const b = C.bolts.spawn();
    b.position.copy(C.scriptDrone.position).addScaledVector(forward(C.tmp), -4).setY(ARENA_Y);
    b.userData.dir.copy(C.tmp); // +forward: toward the drone (it sits at +9·forward)
    b.userData.life = BOLT_LIFE;
    b.lookAt(C.tmp2.copy(b.position).add(b.userData.dir));
  }
  if (C.scriptT >= 1.4) {
    C.scriptDone = true;
    C.api.report({ scriptedKill: {
      score: C.score, kills: C.kills,
      enemiesAlive: ENEMIES.aliveCount() + ENEMIES.queuedCount(),
      particles: EFFECTS.particleCount(),
      boltsLive: C.bolts.live,
    } });
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
function droneProbeTick(dt) {
  if (!DRONE_PROBE || C.dpDone) return;
  C.dpT += dt;
  if (!C.dpDrone && C.dpT >= 0.4 && DRONES.poolReady()) {
    forward(C.tmp);
    C.dpDrone = DRONES.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 12));
    C.dpT = 0; C.dpWin = 0; // the measured window runs from the spawn
    return;
  }
  const d = C.dpDrone;
  if (!d) return;
  C.dpWin += dt;
  const u = d.userData;
  const m = C.dpMM || (C.dpMM = {
    minX: d.position.x, maxX: d.position.x,
    minY: d.position.y, maxY: d.position.y,
    minZ: d.position.z, maxZ: d.position.z,
  });
  m.minX = Math.min(m.minX, d.position.x); m.maxX = Math.max(m.maxX, d.position.x);
  m.minY = Math.min(m.minY, d.position.y); m.maxY = Math.max(m.maxY, d.position.y);
  m.minZ = Math.min(m.minZ, d.position.z); m.maxZ = Math.max(m.maxZ, d.position.z);
  C.dpSamples++;
  if (u.mode === 'telegraph') C.dpTele = true;
  if (u.mode === 'dive') C.dpDive = true;
  if (!u.alive) C.dpContact = true; // died inside the window — the dive rammed the stationary ship
  window.__stage2.droneProbeLive = true;
  if (C.dpWin >= 3.0 || !u.alive) {
    C.dpDone = true;
    let parts = 0;
    d.traverse((o) => { if (o.isMesh) parts++; }); // GLB path has a different part count — mesh-level swap evidence
    const probe = {
      yRange: +(m.maxY - m.minY).toFixed(2),
      path3d: { x: +(m.maxX - m.minX).toFixed(2), y: +(m.maxY - m.minY).toFixed(2), z: +(m.maxZ - m.minZ).toFixed(2), samples: C.dpSamples },
      telegraph: C.dpTele, dive: C.dpDive, contact: C.dpContact,
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
 *   death — hp 0 → slow-mo cinematic → bossDefeated report → the entity drains.
 * Reports window.__stage2.bossProbe = { phases, weakHits, bodyHits, weakDmg, bodyDmg, ratio,
 * chargeDash, overshoot, deathSlowmo, spawnWave, hudLine } (+ lastReport parity via api.report).
 * ?bossShot=1: evidence-capture variant — closer spawn + per-phase holds + bossShotPhase
 * markers for tools/boss-shot.mjs; the drive and its asserts are unchanged. */
function bossBolt(target, away) { // one real player bolt placed 3 u out on `away`, flying into `target`
  const b = C.bolts.spawn();
  b.position.copy(target).addScaledVector(away, 3.0);
  b.userData.dir.copy(away).negate();
  b.userData.life = BOLT_LIFE;
  b.lookAt(C.tmp.copy(b.position).add(b.userData.dir));
}
function bossProbeTick(dt) {
  if (!BOSS_PROBE || C.bpDone) return;
  const rdt = dt / Math.max(0.05, C.api.getTimeScale()); // real-time clock — the death slow-mo must not stall the drive
  C.bpT += rdt;
  C.bpStageT += rdt;
  window.__stage2.bossProbeLive = true;
  const st = BOSS.state();
  // HUD evidence: sample the real DOM each tick while the boss lives
  if (st && C.ui.hudBars && C.ui.hudBars.textContent.includes('BOSS')) C.bpHud = true;
  if (BOSS_SHOT) window.__stage2.bossShotPhase = st ? st.phase : 'dead';

  if (C.bpStage === 'spawn') {
    if (C.bpT >= 0.4) {
      forward(C.tmp);
      BOSS.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, BOSS_SHOT ? 14 : 26).setY(ARENA_Y));
      C.bpSpawnWave = C.wave;
      C.bpHpMark = BOSS.state().hp;
      C.bpStage = 'weak'; C.bpStageT = 0; C.bpFired = 0;
      BOSS.probeHold(true); // pin the boss for the deterministic ratio test
    }
    return;
  }
  if (C.bpStage === 'weak' || C.bpStage === 'body') {
    const node = C.bpStage === 'weak';
    if (C.bpFired < 3 && C.bpStageT >= C.bpFired * 0.35 + 0.1) {
      const t = BOSS.probeTargets(C.pos);
      const target = node ? t.node : t.hull;
      bossBolt(target, C.tmp.copy(C.pos).sub(target).normalize());
      C.bpFired++;
    }
    const ps = BOSS.probeStats();
    if ((node ? ps.weakHits : ps.bodyHits) >= 3 || C.bpStageT > 3.0) {
      C.bpHpMark = st ? st.hp : 0;
      C.bpStage = node ? 'body' : 'charge';
      C.bpStageT = 0; C.bpFired = 0;
      if (!node) BOSS.probeHold(false); // behavior resumes for the charge/rage walk
    }
    return;
  }
  if (C.bpStage === 'charge') {
    if (!C.bpCharged && st) { BOSS.probeDamage(st.hp - 34, C.api); C.bpCharged = true; } // 57% — below CHARGE_AT 0.66
    const hold = BOSS_SHOT ? 2.2 : 0;
    const ps = BOSS.probeStats();
    if (ps.chargeDash && ps.overshoot) { C.bpStage = 'rage'; C.bpStageT = 0; }
    else if (C.bpStageT > 6.0 + hold) { C.bpStage = 'rage'; C.bpStageT = 0; } // timeout — the asserts record what's missing
    return;
  }
  if (C.bpStage === 'rage') {
    if (!C.bpRaged && st) { BOSS.probeDamage(st.hp - 15, C.api); C.bpRaged = true; } // 25% — below RAGE_AT 0.33
    if (BOSS_SHOT && st && st.phase === 'rage' && !C.bpRagePinned) {
      // evidence framing: hold the boss 14 u ahead of the nose for the rage screenshot —
      // the natural 20 u rage orbit carries it out of the chase-cam frame at random bearings
      BOSS.probeHold(true);
      forward(C.tmp);
      BOSS.probePlace(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 14).setY(ARENA_Y));
      C.bpRagePinned = true;
    }
    if (st && st.phase === 'rage' && C.bpStageT >= (BOSS_SHOT ? 2.4 : 0.8)) { C.bpStage = 'death'; C.bpStageT = 0; }
    return;
  }
  if (C.bpStage === 'death') {
    if (!C.bpKilled && st) { BOSS.probeDamage(st.hp, C.api); C.bpKilled = true; }
    const rep = window.__stage2.lastReport;
    if ((!BOSS.alive() && rep && rep.bossDefeated) || C.bpStageT > 10) {
      C.bpDone = true;
      const ps = BOSS.probeStats();
      const probe = {
        phases: ps.phases,
        weakHits: ps.weakHits, bodyHits: ps.bodyHits,
        weakDmg: ps.weakDmg, bodyDmg: ps.bodyDmg,
        ratio: ps.bodyDmg > 0 ? +(ps.weakDmg / ps.bodyDmg).toFixed(2) : 0,
        chargeDash: ps.chargeDash, overshoot: ps.overshoot,
        deathSlowmo: ps.deathSlowmo,
        spawnWave: C.bpSpawnWave,
        hudLine: C.bpHud,
        bossDefeated: (rep && rep.bossDefeated) || null, // the death report the drive observed (lastReport is a single slot — the probe report lands after it)
      };
      window.__stage2.bossProbe = probe;
      window.__stage2.bossProbeLive = false;
      window.__stage2.bossShotPhase = null;
      C.api.report({ bossProbe: probe }); // parity with scriptedKill/droneProbe — lands on __stage2.lastReport too
    }
  }
}

function scanNearest() { // full-3D distance to the closest live raider, or null (story-009 spec §5)
  let best = null;
  ENEMIES.eachAlive((d) => {
    const dx = d.position.x - C.pos.x, dy = d.position.y - C.pos.y, dz = d.position.z - C.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (best === null || dist < best) best = dist;
  });
  return best;
}

/* ---------- phase API ---------- */
export function enterCombat(scene, camera, rocket, ui, api) {
  prepareCombat(scene, camera, rocket, ui, api);
  reparentRocket(true);
  if (!C.rim) { // story-005: the sector edge is visible before you reach it
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(R_HARD - 0.8, R_HARD + 0.8, 128),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = ARENA_Y + 0.5;
    ring.renderOrder = 5;
    scene.add(ring);
    C.rim = ring;
  }
  C.rim.visible = true;
  C.pos.set(0, ARENA_Y, 0);
  C.vel.set(0, 0, 0);
  C.heading = 0; C.bank = 0; C.speed = 0;
  C.hp = HP_MAX; C.shield = SHIELD_MAX; C.regenT = 0; C.dead = false; C.deathT = 0;
  C.fireT = 0; C.boost = 1; C.boosting = false;
  C.score = 0; C.kills = 0; C.wave = 1; C.waveGapT = 0;
  C.scriptT = -1; C.scriptDone = false; C.scriptDrone = null;
  C.dpT = -1; C.dpDrone = null; C.dpWin = 0; C.dpDone = false; // story-012: probe state restarts clean
  C.dpTele = false; C.dpDive = false; C.dpContact = false; C.dpSamples = 0; C.dpMM = null;
  window.__stage2.droneProbeLive = false;
  // story-013: boss + its probe state restart clean; the single entity drains with the pools (§8.6)
  BOSS.clearBoss();
  C.bpT = -1; C.bpStage = 'spawn'; C.bpStageT = 0; C.bpFired = 0; C.bpHpMark = 0;
  C.bpSpawnWave = 0; C.bpHud = false; C.bpCharged = false; C.bpRaged = false; C.bpRagePinned = false; C.bpKilled = false; C.bpDone = false;
  window.__stage2.bossProbeLive = false;
  window.__stage2.bossShotPhase = null;
  delete window.__stage2.bossProbe; // a fresh combat must never inherit the previous walk's report
  C.flow = 0;
  C.proxScanT = 0; C.nearest = null; // story-009: proximity scan restarts clean (§8.6)
  C.lastBars = null; C.lastScore = null; // clearCombat emptied the DOM — force one HUD rewrite
  C.bolts.clear();
  ENEMIES.clearEnemies();
  DRONES.clearDrones();
  EFFECTS.clearEffects();
  if (ui.warn) ui.warn.hidden = true;
  api.setTimeScale(1);
  ENEMIES.startWave(C.wave, C.pos);
  musicEvict(0.2); // story-009: engine loops die, the music bags survive — the phase hooks own stopping them (spec §7)
  C.bed = loopStart({ freq: 46, vol: 0.05, playback: 0.4 }); // deep-space bed
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // Space must not re-click title buttons
}

export function tickCombat(dt, t) {
  const p = C.pose;
  steer(dt);
  fireTick(dt);
  boltsTick(dt);
  ENEMIES.tickEnemies(dt, C.pos, { damagePlayer, explosion: (pos) => EFFECTS.explosion(pos) });
  DRONES.tickDrones(dt, C.pos, { damagePlayer, explosion: (pos) => EFFECTS.explosion(pos) });
  BOSS.tickBoss(dt, C.pos, C.bossApi); // story-013: the warden — single-entity state machine
  wavesTick(dt);
  scriptedKillTick(dt);
  droneProbeTick(dt);
  bossProbeTick(dt);

  // shield regen after a clean 3 s
  C.regenT += dt;
  if (C.regenT >= SHIELD_REGEN_DELAY) C.shield = Math.min(SHIELD_MAX, C.shield + SHIELD_REGEN_RATE * dt);

  // ship pose + chase cam
  p.position.copy(C.pos);
  p.rotation.y = C.heading;
  p.rotation.z = C.bank;
  const camTarget = C.tmp.copy(C.pos).addScaledVector(forward(C.tmp2), -7.5 - C.vel.length() * 0.22); // velocity trail (story-002): thrust visibly surges the ship ahead in frame
  camTarget.y += 3.4;
  const k = 1 - Math.exp(-5 * dt); // feel: trail reads — 6 -> 5 (story-002)
  C.camera.position.lerp(camTarget, k);
  C.camera.lookAt(C.pos.x + forward(C.tmp2).x * 4, ARENA_Y, C.pos.z + C.tmp2.z * 4);
  EFFECTS.applyShake(dt);
  EFFECTS.tickEffects(dt); // drive the explosion pool — was never called (particles never faded)
  C.flow += ((C.boosting ? 1 : 0) - C.flow) * (1 - Math.exp(-4 * dt)); // smoothed boost rush
  combatFlow(dt, C.flow); // the field streams past the lane — asteroids, wrecks, planet, hole

  // story-009 audio — exactly one duck / alarm / proximity call per frame, nothing else (spec §7)
  C.proxScanT -= dt;
  if (!C.dead && C.proxScanT <= 0) { C.proxScanT = 0.15; C.nearest = scanNearest(); }
  musicSetDuck(C.flow);
  alarmTick(dt, C.hp, C.dead);
  proximityTick(dt, C.dead ? null : C.nearest);

  // HUD — honest values, DOM writes only on change (feel: no per-frame innerHTML churn).
  // story-013: the BOSS HP line rides this same change-gated wholesale write — presentation
  // only (state lives in combatState().boss), present while the boss lives, gone after death.
  if (C.ui.hudBars) {
    const bossLine = BOSS.barLine();
    const bars =
      `HULL ${fmt(C.hp)}<div class="bar"><i style="width:${fmt(clamp(C.hp, 0, HP_MAX))}%"></i></div>` +
      `SHIELD ${fmt(C.shield)}<div class="bar sh"><i style="width:${fmt(clamp(C.shield, 0, SHIELD_MAX) * 2)}%"></i></div>` +
      `BOOST ${fmt(C.boost * 100)}%` +
      (bossLine ? `<div>${bossLine}</div>` : '');
    if (bars !== C.lastBars) { C.ui.hudBars.innerHTML = bars; C.lastBars = bars; }
  }
  if (C.ui.hudScore) {
    const score = `SCORE ${fmt(C.score)}   WAVE ${fmt(C.wave)}`;
    if (score !== C.lastScore) { C.ui.hudScore.textContent = score; C.lastScore = score; }
  }

  // reticle rides the pointer — the OS cursor is hidden while playing (template .playing)
  if (C.ui.reticle && C.api.input.mouseActive) {
    const px = C.api.input.px;
    if (px.x !== C.retX || px.y !== C.retY) {
      C.retX = px.x; C.retY = px.y;
      C.ui.reticle.style.left = px.x + 'px';
      C.ui.reticle.style.top = px.y + 'px';
    }
  }

  // edge pips — point at raiders you can't see (off-screen or behind the camera)
  if (C.pips.length) {
    const ring = 130, cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    C.camera.getWorldDirection(C.pipFwd);
    C.pipInv.copy(C.camera.quaternion).invert();
    let pi = 0;
    ENEMIES.eachAlive((d) => {
      if (pi >= C.pips.length) return;
      C.pipDir.set(d.position.x, d.position.y, d.position.z).sub(C.camera.position);
      const dist = C.pipDir.length();
      const inFront = C.pipDir.dot(C.pipFwd) > 0;
      if (inFront) {
        C.ndc.set(d.position.x, d.position.y, d.position.z).project(C.camera);
        if (Math.abs(C.ndc.x) < 0.93 && Math.abs(C.ndc.y) < 0.88) return; // visible — no pip
      }
      C.pipDir.copy(d.position).sub(C.camera.position).applyQuaternion(C.pipInv);
      const len = Math.hypot(C.pipDir.x, C.pipDir.y) || 1; // behind threats project by their turn direction
      const pxN = C.pipDir.x / len, pyN = C.pipDir.y / len;
      const pip = C.pips[pi++];
      pip.style.transform =
        `translate(${(cx + pxN * ring - 7).toFixed(1)}px, ${(cy - pyN * ring - 7).toFixed(1)}px)` +
        ` rotate(${Math.atan2(pxN, pyN).toFixed(2)}rad)`;
      pip.style.opacity = (0.85 - 0.55 * Math.min(1, dist / 110)).toFixed(2);
    });
    for (; pi < C.pips.length; pi++) C.pips[pi].style.opacity = '0';
  }

  if (C.dead) {
    if (C.api.input.fire) C.deathT = DEATH_SLOWMO; // dying: a click lands the card now (gofix 2026-11-03)
    C.deathT += dt / Math.max(0.05, C.api.getTimeScale()); // real-time slow-mo clock
    if (C.deathT >= DEATH_SLOWMO) { C.dead = false; C.api.go('gameover'); return; }
  }
}

export function clearCombat() {
  if (!C.ready) return;
  C.bolts.clear();
  ENEMIES.clearEnemies(); // also drains the boss volley's bolts — the volley rides E.bolts (story-013)
  DRONES.clearDrones(); // story-012: the orb pool rides the same §8.6 drain — restarts allocate nothing new
  BOSS.clearBoss(); // story-013: the single entity hides + resets — spawn-once latch re-arms for the next combat
  EFFECTS.clearEffects();
  window.__stage2.droneProbeLive = false;
  musicEvict(0.25); // story-009: engine loops die, the music bags survive — the phase hooks own stopping them (spec §7)
  C.bed = null;
  reparentRocket(false);
  if (C.ui.warn) C.ui.warn.hidden = true;
  if (C.ui.hudBars) C.ui.hudBars.innerHTML = ''; // pad phases must not inherit combat bars
  if (C.ui.hudScore) C.ui.hudScore.textContent = '';
  if (C.ui.tele) C.ui.tele.textContent = ''; // TD-014 (story-013): the SPD line is combat's write —
  // it must not ride the pad until cruise rewrites (phases.js resets its lastSpd gate on combat.enter)
  C.dead = false; C.deathT = 0; C.speed = 0;
  if (C.rim) { C.rim.material.opacity = 0; C.rim.visible = false; } // story-005: rim leaves the render list with combat (review R2-9)
}

/* ---------- probe surface (window.__stage2 reads these) ---------- */
export function combatState() {
  return {
    hp: C.hp, shield: C.shield, score: C.score, wave: C.wave, kills: C.kills,
    enemies: ENEMIES.aliveCount() + ENEMIES.queuedCount(),
    drones: DRONES.aliveCount(), // story-012: live orb count (queued orbs are the wave layer's business)
    boss: BOSS.state(), // story-013: { hp, maxHp, phase } while the boss lives, null otherwise
    particles: EFFECTS.particleCount(),
    bolts: C.bolts ? C.bolts.live : 0,
    ebolts: ENEMIES.eboltCount(),
    boost: C.boost,
    speed: +C.speed.toFixed(2), heading: +C.heading.toFixed(3), // probe surface — flow-check's throttle/turn asserts (story-004)
    pos: C.pos.toArray().map((v) => +v.toFixed(2)), // probe surface — flow-check's keyboard-motion assert (story-003)
    dead: C.dead,
  };
}
export function probeDamagePlayer(n) { damagePlayer(n); }
export function deathFastForward() { // dying: Enter/Space skip the slow-mo (main routes here; no-op once the card is up)
  if (C.dead) C.deathT = DEATH_SLOWMO;
}
