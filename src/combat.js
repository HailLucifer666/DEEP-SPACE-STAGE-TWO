// STAGE TWO — COMBAT CORE (S4): chase-cam space combat around the hero rocket.
// Owns: player ship pose (re-parents the rocket into a yaw/pitch/roll pose group),
// throttle+turn flight + pitch/drift (story-015: W/S throttle, A/D + pointer steer, R/F + pointer-Y pitch, drift vel — no pointer lock),
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
// story-015 (full-3d-flight GDD §3.1-§3.4): pitch + drift. Pitch mirrors the yaw grammar
// exactly (deadzone 0.08, 1.25× combined clamp) inside a ±72° envelope — no loops, ever
// (GDD §5.1: changing that is a design-level reopen, not a tuning knob). Drift makes vel a
// PERSISTENT state realigning toward the nose (§3.2). BAND_H/BAND_HH are the 015 altitude
// band SCAFFOLD (the boundary is still the flat disc) — story-016 deletes both consts and
// their asserts as a documented retirement.
const PITCH_RATE = 1.8;      // rad/s commanded pitch — slightly slower than yaw: pitch is posture, yaw is aiming
const PITCH_MAX = 1.2566;    // 72° — up-vector safety envelope (camera lateral basis ≥ 0.31 at max pitch)
const PITCH_DEADZONE = 0.08; // NDC — mirrors the yaw deadzone exactly
const PITCH_INVERT = false;  // flips the POINTER convention ONLY (keys unaffected) — playtest escape hatch
const ALIGN_RATE = 4.5;      // 1/s — drift realignment toward forward·speed (slip ≈ 25° at full turn)
const BAND_H = 16, BAND_HH = 20; // altitude band around ARENA_Y — 015 scaffold, retired by story-016
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
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), heading: 0, bank: 0, speed: 0, pitch: 0, // speed = throttle state (u/s along the nose); heading/pitch are player-commanded (story-004/015); vel is drift state (persistent, story-015)
  hp: HP_MAX, shield: SHIELD_MAX, regenT: 0, dead: false, deathT: 0,
  fireT: 0, boost: 1, boosting: false,
  wave: 0, waveGapT: 0, score: 0, kills: 0,
  time: 0, // story-014: per-fight combat clock — scaled sdt while alive (the world's slow-mo slows it), frozen while dead; reset each enterCombat. NOT game.time (the global clock — launch phases own it)

  bed: null, scriptT: -1, scriptDone: false,
  // story-012 drone probe state (?droneProbe=1) — probe-only fields, untouched by normal play
  dpT: -1, dpDrone: null, dpWin: 0, dpDone: false,
  dpTele: false, dpDive: false, dpContact: false, dpSamples: 0, dpMM: null,
  // story-013 boss probe state (?bossProbe=1) — probe-only fields, untouched by normal play
  bossApi: null, bpT: -1, bpStage: 'spawn', bpStageT: 0, bpFired: 0, bpHpMark: 0,
  bpSpawnWave: 0, bpHud: false, bpCharged: false, bpRaged: false, bpRagePinned: false, bpKilled: false, bpDone: false,
  pp: null, ppDone: false, // story-015 pitch probe state (?pitchProbe=1) — one probe-only object, rebuilt fresh on combat entry; ppDone latches the walk (§8.6 same-page re-entry, dpDone/bpDone sibling)
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
const PITCH_PROBE = qs.get('pitchProbe') === '1'; // story-015: deterministic pitch+drift walk

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
    // story-014: the bossDefeated signal IS the victory trigger. Deliberately handled in this
    // wrapper (combat.js owns the api object; boss.js stays a pure signal source) and fired on
    // the report EVENT path — NOT a lastReport-slot poll, which a combat teardown (player death
    // during the 1.2 s cinematic) would orphan before it ever ran. The report lands first (probe
    // parity — the bossProbe drive reads it in the same frame), then go('victory') is guarded by
    // !C.dead so the two card paths stay mutually exclusive: if the player is already dead the
    // gameover path wins; if victory lands first, clearCombat cancels the death clock.
    report: (r) => {
      C.api.report(r);
      if (r && r.bossDefeated) {
        // stage-2 review (finding 1): the exactly-once counter — the completion block's
        // re-fire class must be COUNTABLE by the harness, not just unobservable.
        window.__stage2.bossDefeatedReports = (window.__stage2.bossDefeatedReports || 0) + 1;
        // stage-2 review (finding 3): the victory frame must not continue into wavesTick —
        // with the field now clear it grants the wave-clear bonus AFTER the card froze its
        // score (the card's "final score" was not the internal final).
        if (!C.dead) { C.victoryFired = true; C.api.go('victory'); }
      }
    },
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
  // story-015 keystone (GDD §3.0): the 3D form. Every consumer — ship velocity, player
  // bolts, chase cam, probe spawns — gains the vertical component correctly from this ONE
  // change. φ = pitch, nose-up positive.
  const cp = Math.cos(C.pitch);
  return out.set(Math.sin(C.heading) * cp, Math.sin(C.pitch), Math.cos(C.heading) * cp);
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

  // pitch (story-015, GDD §3.1) — mirrors the yaw grammar exactly: pointer-Y DIRECT (above
  // center = nose up, input.mouse.y is already NDC-up-positive and was unused), same 0.08
  // deadzone, R = up / F = down, 1.25× combined clamp. ArrowUp/Down stay throttle aliases —
  // they do NOT become pitch.
  const keyPitch = (keys.has('KeyR') ? 1 : 0) - (keys.has('KeyF') ? 1 : 0);
  const myNdc = input.mouseActive ? input.mouse.y : 0;
  const my = Math.abs(myNdc) > PITCH_DEADZONE ? myNdc : 0;
  const pitchCmd = clamp(keyPitch + (PITCH_INVERT ? -my : my), -1.25, 1.25);
  C.pitch = clamp(C.pitch + pitchCmd * PITCH_RATE * dt, -PITCH_MAX, PITCH_MAX);

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

  // drift (story-015, GDD §3.2): vel is a PERSISTENT state realigning toward the nose — the
  // ship flies where the nose points *within a slip angle* (~25° at full turn). The exp form
  // is dt-scaled (R3: never a per-frame multiplier); speed stays the throttle state (C.speed)
  // and at speed 0 drift is inert (the story-004 turn-in-place assert survives untouched).
  // Ordering is LOAD-BEARING (GDD §4.5): alignment runs FIRST, then the boundary bleeds, then
  // integration — alignment after the bleed would undo the boundary's radial cap every frame.
  // The nose is still player-owned: vel chases the nose, never the reverse (the old
  // velocity-derived heading is what made W flip the camera 180°).
  C.vel.lerp(forward(C.tmp).multiplyScalar(C.speed), 1 - Math.exp(-ALIGN_RATE * dt));

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
  // altitude band (story-015 SCAFFOLD, GDD §3.4 — retired by story-016): pitch exists while
  // the boundary is still the flat disc, so the vertical component bleeds inside
  // [ARENA_Y − BAND_H, ARENA_Y + BAND_H] with story-005's exact cap-and-floor feel (floor 3,
  // the anti-mud floor) and a hard ±BAND_HH safety net below; #warn reuses the rim grammar.
  let dY = Math.abs(C.pos.y - ARENA_Y);
  if (dY > BAND_H) {
    const ny = C.pos.y > ARENA_Y ? 1 : -1;
    const radialY = C.vel.y * ny;
    const capY = Math.max(3, MAX_SPEED * (BAND_HH - dY) / (BAND_HH - BAND_H));
    if (radialY > capY) C.vel.y -= (radialY - capY) * ny;
  }
  C.pos.addScaledVector(C.vel, dt);

  // hard circular clamp — safety net for the one frame the bleed cap allows
  r = Math.hypot(C.pos.x, C.pos.z);
  if (r > R_HARD) {
    const s = R_HARD / r;
    C.pos.x *= s; C.pos.z *= s;
    r = R_HARD;
  }
  // band hard clamp — safety net for the one frame the bleed cap allows (story-005's clamp, vertical)
  dY = Math.abs(C.pos.y - ARENA_Y);
  if (dY > BAND_HH) {
    C.pos.y = ARENA_Y + (C.pos.y > ARENA_Y ? BAND_HH : -BAND_HH);
    dY = BAND_HH;
  }
  if (C.ui.warn) {
    C.ui.warn.hidden = (r <= R_SOFT && dY <= BAND_H) || C.dead;
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
      // story-015: full-3D squared distance (the orb scan's proven form) — the XZ-only form
      // hit a raider a whole ring-tilt above/below the bolt once the ship can pitch
      const dx = d.position.x - b.position.x, dy = d.position.y - b.position.y, dz = d.position.z - b.position.z;
      if (dx * dx + dy * dy + dz * dz < 1.1) {
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
  if (C.dead || C.victoryFired) return; // review (finding 3): the victory frame stops here — the bonus must not land after the card froze its score
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
      ENEMIES.clearEnemies(); // stage-2 review: the drive simulates the NATURAL boss fight — the warden
      // spawns instead of wave BOSS_WAVE+1, so the field is clear (wave-1 raiders gone). Without
      // this, the victory card's score assert cannot reproduce the mid-tick wave-grant class.
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
 *   band — re-seated full-pitch climb + W: max |y−18|, max vy sampled in the 17-20 layer,
 *     #warn seen outside the band.
 *   follow — two probe gunners seated AT the arena plane, player teleported to the band
 *     ceiling (+20 exactly): their mean y must trail within 12 u over 3 s (offset0 recorded).
 * Reports window.__stage2.pitchProbe (pitchProbeLive is the screenshot hook; api.report
 * parity lands lastReport). Damage is healed AFTER the scan window — a ~22 s drive must not
 * die mid-walk with wave raiders orbiting the stationary ship. */
function pitchProbeTick(dt) {
  if (!PITCH_PROBE || C.ppDone) return;
  const pp = C.pp || (C.pp = {
    t: 0, stage: 0, mark: 0, entryPitch: 0, maxPhi: 0, h0: 0, hp0: 0, regenMark: 0,
    dPhi: {}, slip: {}, driftPath: {}, boltRise: {}, band: {}, raiderScan: { ramContact: false, boltHit: false }, raiderFollow: {}, viewDirFromUp: {},
    pts: [], scanG: null, scanR: null, bolt: null, boltP0: null, boltTries: 0, vyMax: 0,
    follow: [], followAcc: 0, followN: 0,
  });
  pp.t += dt;
  window.__stage2.pitchProbeLive = true;
  if (pp.stage >= 2) { if (C.hp < HP_MAX) C.hp = HP_MAX; if (C.shield < SHIELD_MAX) C.shield = SHIELD_MAX; } // the scan window stays honest — heal only after it closes
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
      pp.dPhi.headingDrift = +(C.heading - pp.h0).toFixed(4);
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
      const f = forward(C.tmp);
      const dot = clamp(C.vel.dot(f) / Math.max(0.001, C.vel.length()), -1, 1);
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
      const f = forward(C.tmp);
      const dot = clamp(C.vel.dot(f) / Math.max(0.001, C.vel.length()), -1, 1);
      pp.slip.recoveredDeg = +(Math.acos(dot) * 180 / Math.PI).toFixed(3);
      // C3: re-seat (probe-owned precondition: aligned entry, arena-center safe — the circle
      // keeps r ≤ ~10) and trace one full rev at full yaw
      C.pos.set(0, ARENA_Y, 0); C.pitch = 0;
      C.vel.copy(forward(C.tmp)).multiplyScalar(C.speed);
      keys.add('KeyA'); pp.mark = pp.t; pp.pts.length = 0;
      pp.stage = 11;
    }
    return;
  }
  if (pp.stage === 11) { // C3: sample the rev
    pp.pts.push([C.pos.x, C.pos.z]);
    if (pp.t >= pp.mark + 2 * Math.PI / TURN_RATE) {
      keys.delete('KeyA');
      const cx = pp.pts.reduce((a, p2) => a + p2[0], 0) / pp.pts.length;
      const cz = pp.pts.reduce((a, p2) => a + p2[1], 0) / pp.pts.length;
      let sum = 0, mx = 0;
      for (const p2 of pp.pts) { const d2 = Math.hypot(p2[0] - cx, p2[1] - cz); sum += d2; if (d2 > mx) mx = d2; }
      pp.driftPath.radius = +(sum / pp.pts.length).toFixed(2);
      pp.driftPath.radiusMax = +mx.toFixed(2);
      pp.driftPath.samples = pp.pts.length;
      pp.driftPath.revS = +(2 * Math.PI / TURN_RATE).toFixed(3);
      // D: pitched bolt — 45° through the REAL spawn path (noseWorld + forward), tracked 0.5 s
      C.pitch = 0.7854;
      pp.boltRise.phi = +C.pitch.toFixed(4);
      const b = C.bolts.spawn();
      noseWorld(b.position);
      forward(b.userData.dir);
      b.userData.life = BOLT_LIFE;
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
      noseWorld(b.position);
      forward(b.userData.dir);
      b.userData.life = BOLT_LIFE;
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
      // E: band climb — re-seat, full pitch up + W (still held)
      C.pos.set(0, ARENA_Y, 0); C.vel.set(0, 0, 0); C.pitch = 0; C.heading = 0;
      keys.add('KeyR'); pp.mark = pp.t;
      pp.band.maxYDev = 0; pp.vyMax = 0; pp.band.warnSeen = false;
      pp.stage = 13;
    }
    return;
  }
  if (pp.stage === 13) { // band climb: full pitch (reached in 0.7 s) then W holds the climb into the ceiling
    const dev = Math.abs(C.pos.y - ARENA_Y);
    pp.band.maxYDev = Math.max(pp.band.maxYDev, +dev.toFixed(2));
    if (dev >= 18 && dev <= 20) pp.vyMax = Math.max(pp.vyMax, C.vel.y); // the 18-20 layer — 2+ u inside the soft edge (story-005 sampled 5+ inside its 20-deep shell; the band shell is 4 deep, and a 17-layer sample still carries the pre-edge cap one climb-frame past entry)
    if (dev > BAND_H && C.ui.warn && !C.ui.warn.hidden) pp.band.warnSeen = true;
    if (pp.t >= pp.mark + 2.6) {
      keys.delete('KeyR');
      pp.band.maxVyInLayer = +pp.vyMax.toFixed(2);
      // F: altitude-follow — two probe gunners seated AT the arena plane, player teleported
      // to the band ceiling (+20 exactly): their mean y must trail within 12 u over 3 s
      C.pitch = 0; // the climb left the nose clamped at 72° — level it or the ship keeps climbing
      C.pos.y = ARENA_Y; C.vel.y = 0;
      pp.follow = [
        ENEMIES.spawnForProbe(C.tmp2.set(C.pos.x + 10, ARENA_Y, C.pos.z)),
        ENEMIES.spawnForProbe(C.tmp2.set(C.pos.x - 10, ARENA_Y, C.pos.z)),
      ];
      pp.follow.forEach((g) => { g.userData.kind = 'gunner'; g.userData.hp = 2; });
      C.pos.y = ARENA_Y + BAND_HH; C.vel.y = 0; // +20 offset — the band ceiling IS +20
      pp.raiderFollow.offset0 = BAND_HH;
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
      C.ppDone = true;
      const probe = {
        entryPitch: +(pp.entryPitch || 0).toFixed(4),
        dPhi: pp.dPhi, slip: pp.slip, driftPath: pp.driftPath, boltRise: pp.boltRise,
        band: pp.band, raiderScan: pp.raiderScan, raiderFollow: pp.raiderFollow, viewDirFromUp: pp.viewDirFromUp,
      };
      window.__stage2.pitchProbe = probe;
      window.__stage2.pitchProbeLive = false;
      C.api.report({ pitchProbe: probe }); // parity with scriptedKill/droneProbe/bossProbe — lands on __stage2.lastReport too
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
  C.heading = 0; C.bank = 0; C.speed = 0; C.pitch = 0; // story-015: the replay never inherits a nose-up start (GDD §5.6); vel reset above covers drift
  C.hp = HP_MAX; C.shield = SHIELD_MAX; C.regenT = 0; C.dead = false; C.deathT = 0;
  C.fireT = 0; C.boost = 1; C.boosting = false;
  C.score = 0; C.kills = 0; C.wave = 1; C.waveGapT = 0;
  C.time = 0; // story-014: the clock is per-fight — every combat entry restarts it
  C.scriptT = -1; C.scriptDone = false; C.scriptDrone = null;
  C.dpT = -1; C.dpDrone = null; C.dpWin = 0; C.dpDone = false; // story-012: probe state restarts clean
  C.victoryFired = false; // stage-2 review (finding 3): the flag is per-fight — a fresh combat grants waves again
  C.dpTele = false; C.dpDive = false; C.dpContact = false; C.dpSamples = 0; C.dpMM = null;
  window.__stage2.droneProbeLive = false;
  // story-013: boss + its probe state restart clean; the single entity drains with the pools (§8.6)
  BOSS.clearBoss();
  C.bpT = -1; C.bpStage = 'spawn'; C.bpStageT = 0; C.bpFired = 0; C.bpHpMark = 0;
  C.bpSpawnWave = 0; C.bpHud = false; C.bpCharged = false; C.bpRaged = false; C.bpRagePinned = false; C.bpKilled = false; C.bpDone = false;
  window.__stage2.bossProbeLive = false;
  window.__stage2.bossShotPhase = null;
  delete window.__stage2.bossProbe; // a fresh combat must never inherit the previous walk's report
  delete window.__stage2.droneProbe; // review NIT 7: same hygiene for the drone walk's report
  C.pp = null; C.ppDone = false; // story-015: pitch probe restarts clean — ppDone too (§8.6: same-page re-entry honors the sibling dpDone/bpDone resets)
  window.__stage2.pitchProbeLive = false;
  delete window.__stage2.pitchProbe; // same hygiene for the pitch walk's report
  window.__stage2.bossDefeatedReports = 0; // review (finding 1): the exactly-once counter is per-fight
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
  if (!C.dead) C.time += dt; // story-014 combat clock — dt is already the scaled sdt (loop.js): the death slow-mo slows the world AND the clock, and the frozen clock reads 0:00-drift while dead
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
  pitchProbeTick(dt); // story-015: deterministic pitch+drift walk (?pitchProbe=1)

  // shield regen after a clean 3 s
  C.regenT += dt;
  if (C.regenT >= SHIELD_REGEN_DELAY) C.shield = Math.min(SHIELD_MAX, C.shield + SHIELD_REGEN_RATE * dt);

  // ship pose + chase cam
  p.position.copy(C.pos);
  p.rotation.y = C.heading;
  p.rotation.x = -C.pitch; // story-015: negative — with YXZ composition a positive rotation.x pitches the +Z-forward nose DOWN (GDD §3.0); bank stays the innermost roll, correct at any pitch
  p.rotation.z = C.bank;
  const camTarget = C.tmp.copy(C.pos).addScaledVector(forward(C.tmp2), -7.5 - C.vel.length() * 0.22); // velocity trail (story-002): thrust visibly surges the ship ahead in frame
  camTarget.y += 3.4; // stays WORLD-up (story-015): never inverts inside the 72° envelope (R1 mitigation IS the clamp)
  const k = 1 - Math.exp(-5 * dt); // feel: trail reads — 6 -> 5 (story-002)
  C.camera.position.lerp(camTarget, k);
  C.camera.lookAt(C.pos.x + C.tmp2.x * 4, C.pos.y + C.tmp2.y * 4, C.pos.z + C.tmp2.z * 4); // story-015: look-target y UNPINNED from ARENA_Y — rides the pitched nose
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
  for (const pip of C.pips) pip.style.opacity = '0'; // story-014 (found during evidence capture): combat's
  // last-frame pip state must not ride the pad — the pips are combat's writes, same class as the #hud-bars
  // clear above (pre-existing leak; the death-card REPLAY inherits this fix too)
  C.dead = false; C.deathT = 0; C.speed = 0;
  if (C.rim) { C.rim.material.opacity = 0; C.rim.visible = false; } // story-005: rim leaves the render list with combat (review R2-9)
}

/* ---------- probe surface (window.__stage2 reads these) ---------- */
export function combatState() {
  return {
    hp: C.hp, shield: C.shield, score: C.score, wave: C.wave, kills: C.kills,
    time: +C.time.toFixed(2), // story-014: elapsed combat seconds — the victory card reads this
    enemies: ENEMIES.aliveCount() + ENEMIES.queuedCount(),
    drones: DRONES.aliveCount(), // story-012: live orb count (queued orbs are the wave layer's business)
    boss: BOSS.state(), // story-013: { hp, maxHp, phase } while the boss lives, null otherwise
    particles: EFFECTS.particleCount(),
    bolts: C.bolts ? C.bolts.live : 0,
    ebolts: ENEMIES.eboltCount(),
    boost: C.boost,
    speed: +C.speed.toFixed(2), heading: +C.heading.toFixed(3), // probe surface — flow-check's throttle/turn asserts (story-004)
    pitch: +C.pitch.toFixed(3), velMag: +C.vel.length().toFixed(2), // story-015: pitch envelope + true speed under drift (SPD keeps showing C.speed; velMag is harness-only, §8 decision c)
    pos: C.pos.toArray().map((v) => +v.toFixed(2)), // probe surface — flow-check's keyboard-motion assert (story-003)
    dead: C.dead,
  };
}
export function probeDamagePlayer(n) { damagePlayer(n); }
export function deathFastForward() { // dying: Enter/Space skip the slow-mo (main routes here; no-op once the card is up)
  if (C.dead) C.deathT = DEATH_SLOWMO;
}
