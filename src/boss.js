// STAGE TWO — THE BOSS (story-013): the sector warden. A SINGLE entity — no pool — that
// spawns once per combat, after wave BOSS_WAVE clears, instead of wave BOSS_WAVE + 1
// (story-014 wires the victory card; until then waves continue after its death). Design:
// production/epics/combat-feel-fix/story-013-boss-fight.md.
//
// Three-phase HP state machine — transitions are a pure function of hp/maxHp, checked on
// every tick and after every damage application:
//   orbit+volley (>66%)  — holds ring range 25–35 u, fires aimed 3-round volleys with spread
//   charge     (66–33%)  — periodic dash at the ship's CURRENT position (captured at dash
//                          launch, after a 0.8 s telegraph); the dash OVERSHOOTS past the
//                          ship by OVERSHOOT u and re-orbits (full stops are ram-bait — r2)
//   rage       (<33%)    — faster volley cadence (RAGE_MULT), tighter orbit, glow up
//
// Weak point: a bright core node at the ring's center, a separately-hittable ZONE. Bolts
// inside NODE_R of the node do WEAK_MULT damage; the hull is the RING (torus centerline
// band) — a center-shot threads the ring hole and reaches the node, an edge shot pays 1×.
// Visual language is story-012's drone (additive halo sprite + emissive trim, ring+core+
// fins silhouette), scaled up and shifted to amber so aim skill reads at a glance.
//
// Death: hp 0 → setTimeScale(0.3) slow-mo for DEATH_T seconds of REAL time (the combat.js
// player-death clock pattern), chained explosions through the EFFECTS api, then
// bossDefeated is reported via api.report and the entity drains.
//
// Pool decision (reported): the volley reuses the ENEMY-bolt pool via enemies.js fireEBolt —
// the pre-authorized helper export — so the dodgeable philosophy (speed, spread, player-hit
// rule) is guaranteed identical and restarts allocate nothing new. The spawn-once latch
// (B.spawned) lives HERE, like drones own their wave queue; combat.js only consults
// eligible()/alive() at the wave gate and drains via clearBoss (§8.6).
import { THREE } from 'stage-two-lib';
import { fireEBolt } from './enemies.js';
import { beep, noiseBurst, sweep } from './audio.js';

/* ---------- tuning knobs (design: story-013 boss-fight) ---------- */
export const BOSS_WAVE = 5;               // the boss spawns instead of wave BOSS_WAVE + 1
const BOSS_HP = 60;                       // ≈ 20 body hits / 7 weak-point hits at 1-dmg bolts
const CHARGE_AT = 0.66, RAGE_AT = 0.33;   // phase thresholds on hp/maxHp
const RAGE_MULT = 1.6;                    // rage: volley cadence ×, orbit speed ×
const ORBIT_HOLD = 30, RAGE_HOLD = 20;    // design ring range 25–35 u; rage tightens in
const ORBIT_SPEED = 5.5;                  // u/s along the ring
const VOLLEY_INTERVAL = 2.4;              // s between 3-round volleys
const VOLLEY_ROUNDS = 3;
const VOLLEY_SPACING = 0.14;              // s between rounds of one volley
const VOLLEY_SPREAD = 0.05;               // gunner-style spread — bursts are dodgeable
const VOLLEY_RANGE = 42;                  // holds fire beyond this
const CHARGE_FIRST = 1.5;                 // s in-phase before the first telegraph
const CHARGE_EVERY = 5.0;                 // s between charges after the first
const TELEGRAPH_T = 0.8;                  // design: 0.8 s dash telegraph (flare + audio tick)
const CHARGE_SPEED = 30;                  // u/s dash — reads distinctly faster than the ship
const OVERSHOOT = 10;                     // u past the captured position before re-orbiting
const BOSS_RAM = 25;                      // rammer-rule contact damage during the dash
const WEAK_MULT = 3;                      // design: node bolts do 3× damage
const NODE_R = 0.95;                      // weak-point hit radius (world units)
const RING_R = 2.0, RING_BAND = 0.55, RING_PLANE = 1.0; // hull = the torus centerline band
const DEATH_SCALE = 0.3;                  // slow-mo timeScale (combat.js player-death value)
const DEATH_T = 1.2;                      // seconds of REAL time
const DEATH_BOOM_EVERY = 0.18;            // s between chained explosions
const HALO_BASE = 4.4, HALO_RAGE = 5.8;   // boss halo; rage pushes the glow up (design)

const B = {
  ready: false, scene: null, boss: null,
  spawned: false, hp: 0, maxHp: BOSS_HP, phase: 'orbit', phaseLog: [],
  volleyT: 0, volleyLeft: 0, volleyGapT: 0,
  chargeT: 0, teleT: -1, dash: false, ramHit: false,
  dashDir: new THREE.Vector3(), dashTarget: new THREE.Vector3(),
  dying: false, dead: false, deathT: 0, boomT: 0,
  // probe/evidence counters (bossProbe reads probeStats(); bolt-stream hits only —
  // scripted probeDamage is deliberately excluded from the ratio counters)
  weakHits: 0, bodyHits: 0, weakDmg: 0, bodyDmg: 0,
  dashLaunched: false, overshootSeen: false, slowmoSeen: false,
  hold: false, // probe pin: transitions + glow stay live, behavior freezes (deterministic ratio test)
  tmp: new THREE.Vector3(), tmp2: new THREE.Vector3(),
  axX: new THREE.Vector3(), axY: new THREE.Vector3(), axZ: new THREE.Vector3(),
};

/* ---------- procedural body: ring + inner ring + core node + 3 fins (drone.js language) ---------- */
function buildBoss() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x2b3a48, roughness: 0.35, metalness: 0.7, emissive: 0x14344a, emissiveIntensity: 0.55 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x7dd7ff, roughness: 0.4, metalness: 0.3, emissive: 0x3a86a8, emissiveIntensity: 0.7 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.18, 12, 40), hull); // hole along Z — the eye faces the ship (drone.js comment)
  const inner = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 8, 28), trim);
  // the weak point — a bright emissive sphere (unlit basic material reads hot under bloom),
  // a child mesh at the ring's center with its OWN amber halo
  const node = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffc85a }));
  const finGeo = new THREE.BoxGeometry(0.85, 0.07, 0.22);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(finGeo, trim);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0);
    fin.rotation.z = a + Math.PI / 2;
    g.add(fin);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x7dd7ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(HALO_BASE);
  const nodeHalo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffc85a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  nodeHalo.scale.setScalar(1.9);
  g.add(ring, inner, node, halo, nodeHalo);
  g.userData = { ring, inner, node, halo, nodeHalo };
  return g;
}

export function prepareBoss(scene) {
  if (B.ready) return;
  B.ready = true;
  B.scene = scene;
  B.boss = buildBoss();
  B.boss.visible = false;
  scene.add(B.boss);
}

function resetRun() {
  B.spawned = true;
  B.hp = BOSS_HP;
  B.phase = 'orbit';
  B.phaseLog = ['orbit'];
  B.volleyT = 1.0; B.volleyLeft = 0; B.volleyGapT = 0;
  B.chargeT = CHARGE_FIRST; B.teleT = -1; B.dash = false; B.ramHit = false;
  B.dying = false; B.dead = false; B.deathT = 0; B.boomT = 0;
  B.weakHits = 0; B.bodyHits = 0; B.weakDmg = 0; B.bodyDmg = 0;
  B.dashLaunched = false; B.overshootSeen = false; B.slowmoSeen = false;
  B.hold = false;
  B.boss.visible = true;
}

export function spawnBoss(playerPos) { // natural spawn: 34 u out on a random bearing, ship altitude
  if (!B.ready || B.spawned) return null;
  const a = Math.random() * Math.PI * 2;
  B.boss.position.set(playerPos.x + Math.cos(a) * 34, playerPos.y, playerPos.z + Math.sin(a) * 34);
  resetRun();
  return B.boss;
}

export function spawnForProbe(pos) { // deterministic probe spawn at a given point (drone.js pattern)
  if (!B.ready || B.spawned) return null;
  B.boss.position.copy(pos);
  resetRun();
  B.volleyT = 4.0; // probe-only: first volley delayed so scripted damage never races ship HP
  return B.boss;
}

/* ---------- glow: ONE writer — rage level + telegraph flare compose into the halos ---------- */
function updateGlow() {
  const u = B.boss.userData;
  const rage = B.phase === 'rage' ? 1 : 0;
  const flare = B.teleT >= 0 ? 1 - Math.max(0, B.teleT) / TELEGRAPH_T : 0;
  u.halo.scale.setScalar(HALO_BASE + (HALO_RAGE - HALO_BASE) * rage + flare * 1.2);
  u.halo.material.opacity = 0.5 + 0.25 * rage + flare * 0.3;
  u.nodeHalo.scale.setScalar(1.9 + 0.7 * rage + flare * 1.4);
  u.nodeHalo.material.opacity = Math.min(1, 0.8 + 0.2 * rage);
}

/* ---------- volley: aimed at the ship's CURRENT position, gunner-style spread ---------- */
function fireVolleyRound(playerPos) {
  const dir = B.tmp.copy(playerPos).sub(B.boss.position);
  dir.y = 0; // enemy bolts fly flat — tickBolts checks XZ (same dodgeable plane as raiders)
  dir.normalize();
  dir.x += (Math.random() - 0.5) * VOLLEY_SPREAD;
  dir.z += (Math.random() - 0.5) * VOLLEY_SPREAD;
  dir.normalize();
  fireEBolt(B.boss.position, dir);
  sweep({ f0: 700, f1: 240, dur: 0.12, vol: 0.1, type: 'sawtooth' });
}

function launchDash(playerPos) {
  B.dash = true;
  B.dashLaunched = true;
  B.ramHit = false;
  B.dashTarget.copy(playerPos);
  B.dashDir.copy(playerPos).sub(B.boss.position).normalize(); // full-3D — the CURRENT ship position
  // stage-2 review (finding 6): a ship parked exactly on the boss center normalizes to (0,0,0)
  // — `past` stays 0 forever and the dash never ends. Make the bad state unrepresentable: any
  // fixed direction completes the overshoot and hands back to orbit.
  if (!Number.isFinite(B.dashDir.x) || B.dashDir.lengthSq() < 1e-6) B.dashDir.set(0, 0, 1);
  B.teleT = -1;
  noiseBurst({ dur: 0.4, vol: 0.4, f0: 500, f1: 1200, type: 'bandpass' });
}

function dashTick(dt, playerPos, api) {
  const step = CHARGE_SPEED * dt;
  B.boss.position.addScaledVector(B.dashDir, step);
  B.boss.lookAt(B.tmp.copy(B.boss.position).add(B.dashDir));
  // ram contact — once per dash (the boss does NOT die on contact; the dash continues past)
  if (!B.ramHit && B.boss.position.distanceTo(playerPos) < 3.0) {
    B.ramHit = true;
    api.damagePlayer(BOSS_RAM);
    api.explosion(playerPos);
  }
  // overshoot past the captured position, then re-orbit (full stops are ram-bait — review r2)
  const past = B.tmp2.copy(B.boss.position).sub(B.dashTarget).dot(B.dashDir);
  if (past > OVERSHOOT) {
    B.overshootSeen = true;
    B.dash = false;
    B.chargeT = CHARGE_EVERY;
  }
}

/* ---------- death: slow-mo cinematic, then the bossDefeated report (story-014's hook) ---------- */
function startDeath(api) {
  B.dying = true;
  B.deathT = 0;
  B.boomT = 0;
  B.dash = false;
  B.teleT = -1;
  api.setTimeScale(DEATH_SCALE);
  B.slowmoSeen = api.getTimeScale() < 0.9; // honest record: the scale actually took
  noiseBurst({ dur: 1.0, vol: 0.7, f0: 900, f1: 60 });
}

function deathTick(dt, api) {
  const rdt = dt / Math.max(0.05, api.getTimeScale()); // real-time slow-mo clock (combat.js pattern)
  B.deathT += rdt;
  B.boomT -= rdt;
  if (B.boomT <= 0) { // chained explosions from the existing EFFECTS pools
    B.boomT = DEATH_BOOM_EVERY;
    api.explosion(B.tmp.set(
      B.boss.position.x + (Math.random() - 0.5) * 4.4,
      B.boss.position.y + (Math.random() - 0.5) * 4.4,
      B.boss.position.z + (Math.random() - 0.5) * 4.4));
    api.shake(0.18);
  }
  if (B.deathT >= DEATH_T) {
    B.dead = true;
    B.dying = false; // stage-2 review (finding 1): tickBoss routes on B.dying FIRST — without
    // clearing it, the completion block (final burst, audio, bossDefeated report) re-fired
    // every tick until a phase change drained the boss (reachable: player dies late in the
    // cinematic, gameover lands after completion). B.dead now terminates the route.
    B.boss.visible = false;
    api.setTimeScale(1); // restore; combat/gameover re-set the scale on their own entries
    api.explosion(B.boss.position); // final burst
    noiseBurst({ dur: 0.9, vol: 0.8, f0: 600, f1: 50 });
    api.report({ bossDefeated: { weakHits: B.weakHits, bodyHits: B.bodyHits, slowmo: B.slowmoSeen } }); // story-014 wires the victory card
  }
}

/* ---------- damage core ---------- */
function applyDamage(dmg, isWeak, counted) {
  if (B.dying || B.dead || !B.spawned) return 'dead';
  B.hp = Math.max(0, B.hp - dmg);
  if (counted) { // ratio counters: real bolt-stream hits only (probe scripted damage excluded)
    if (isWeak) { B.weakHits++; B.weakDmg += dmg; }
    else { B.bodyHits++; B.bodyDmg += dmg; }
  }
  return B.hp <= 0 ? 'dead' : 'hit';
}

// combat.js bolt scan — returns true ONLY if this hit started the death cinematic (review
// NIT 9: post-mortem hits during the cinematic return false — the caller's kill-shake fires
// once, at the moment the cinematic actually starts).
export function hitBoss(dmg, isWeak, api) {
  const r = applyDamage(dmg * (isWeak ? WEAK_MULT : 1), isWeak, true);
  const started = r === 'dead' && !B.dying && !B.dead;
  if (started) startDeath(api);
  return started;
}

// probe-only scripted damage (deterministic threshold walk) — excluded from the ratio counters
export function probeDamage(n, api) {
  const r = applyDamage(n, false, false);
  if (r === 'dead' && !B.dying && !B.dead) startDeath(api);
  return r;
}

/* ---------- bolt × boss zones: 2 weak node · 1 hull · 0 none (node outranks the band) ---------- */
export function boltHit(pos) {
  if (!B.ready || !B.spawned || B.dead || !B.boss.visible) return 0;
  const p = B.boss.position;
  const dx = pos.x - p.x, dy = pos.y - p.y, dz = pos.z - p.z;
  if (dx * dx + dy * dy + dz * dz < NODE_R * NODE_R) return 2;
  // hull = the torus centerline circle: RING_R out in the boss's local XY plane (the hole
  // faces the ship), so a center-shot threads the hole and reaches the node, an edge shot
  // crosses the band and pays 1×. Local axes come from the boss quaternion (lookAt(ship)).
  B.axX.set(1, 0, 0).applyQuaternion(B.boss.quaternion);
  B.axY.set(0, 1, 0).applyQuaternion(B.boss.quaternion);
  B.axZ.set(0, 0, 1).applyQuaternion(B.boss.quaternion);
  const x = dx * B.axX.x + dy * B.axX.y + dz * B.axX.z;
  const y = dx * B.axY.x + dy * B.axY.y + dz * B.axY.z;
  const z = dx * B.axZ.x + dy * B.axZ.y + dz * B.axZ.z;
  if (Math.abs(Math.hypot(x, y) - RING_R) < RING_BAND && Math.abs(z) < RING_PLANE) return 1;
  return 0;
}

/* ---------- tick: the visible state machine ---------- */
// dt already timeScaled by caller. api: { damagePlayer(n), explosion(pos), shake(a),
// setTimeScale(v), getTimeScale(), report(r) }
export function tickBoss(dt, playerPos, api) {
  if (!B.ready || !B.boss.visible) return;
  if (B.dying) { deathTick(dt, api); return; }
  if (B.dead) return;

  // phase transitions — pure function of the hp fraction, checked every tick
  const frac = B.hp / B.maxHp;
  const want = frac <= RAGE_AT ? 'rage' : frac <= CHARGE_AT ? 'charge' : 'orbit';
  if (want !== B.phase) {
    B.phase = want;
    B.phaseLog.push(want);
    B.chargeT = CHARGE_FIRST; // fresh charge clock on phase entry
    B.teleT = -1;
    beep({ freq: want === 'rage' ? 220 : 330, dur: 0.18, vol: 0.2, type: 'sawtooth' }); // phase stinger
  }
  updateGlow();
  const u = B.boss.userData;
  if (u.ring) u.ring.rotation.z += dt * 1.4; // idle life (proc language)
  if (u.inner) u.inner.rotation.z -= dt * 2.0;
  if (u.node) u.node.scale.setScalar(1 + Math.sin(performance.now() * 0.004) * 0.12);

  if (B.hold) { // probe pin: glow + transitions live, behavior frozen; the eye keeps facing the ship
    B.boss.lookAt(playerPos.x, B.boss.position.y, playerPos.z);
    return;
  }
  if (B.dash) { dashTick(dt, playerPos, api); return; }

  // orbit steering — radial seek to the hold radius, tangential orbit, altitude rides the ship
  const dx = playerPos.x - B.boss.position.x, dz = playerPos.z - B.boss.position.z;
  const dist = Math.hypot(dx, dz) || 1; // NaN guard §8.9 — never divide by 0
  const hold = B.phase === 'rage' ? RAGE_HOLD : ORBIT_HOLD;
  const speed = ORBIT_SPEED * (B.phase === 'rage' ? RAGE_MULT : 1);
  const err = dist - hold;
  const vRadial = Math.max(-speed, Math.min(speed, err * 0.6));
  const vTang = speed;
  const ux = dx / dist, uz = dz / dist;
  B.boss.position.x += (ux * vRadial - uz * vTang) * dt;
  B.boss.position.z += (uz * vRadial + ux * vTang) * dt;
  B.boss.position.y += (playerPos.y - B.boss.position.y) * (1 - Math.exp(-3 * dt));
  B.boss.lookAt(playerPos.x, B.boss.position.y, playerPos.z);

  // volley cadence — rage multiplies it
  B.volleyT -= dt;
  if (B.volleyT <= 0 && dist < VOLLEY_RANGE) {
    B.volleyT = VOLLEY_INTERVAL / (B.phase === 'rage' ? RAGE_MULT : 1);
    B.volleyLeft = VOLLEY_ROUNDS;
    B.volleyGapT = 0;
  }
  if (B.volleyLeft > 0) {
    B.volleyGapT -= dt;
    if (B.volleyGapT <= 0) {
      B.volleyGapT = VOLLEY_SPACING;
      B.volleyLeft--;
      fireVolleyRound(playerPos);
    }
  }

  // charge phase: periodic telegraphed dash at the ship's CURRENT position (captured at launch)
  if (B.phase === 'charge') {
    if (B.teleT >= 0) {
      B.teleT -= dt;
      if (B.teleT <= 0) launchDash(playerPos);
    } else {
      B.chargeT -= dt;
      if (B.chargeT <= 0) {
        B.teleT = TELEGRAPH_T; // flare rides updateGlow; the tick is the audible warning
        beep({ freq: 980, dur: 0.07, vol: 0.16, type: 'sine' });
      }
    }
  }
}

/* ---------- probe surface + lifecycle ---------- */
export function alive() { // dying still counts — the cinematic blocks wave progression
  return B.ready && B.spawned && !B.dead && B.boss.visible;
}
export function eligible() { // spawn-once latch (per combat) — reset only by clearBoss
  return B.ready && !B.spawned;
}
export function state() { // combatState().boss — the story-012-declared shape
  if (!B.ready || !B.spawned || B.dead || !B.boss.visible) return null;
  return { hp: B.hp, maxHp: B.maxHp, phase: B.dying ? 'dying' : B.phase };
}
export function barLine() { // presentation-only BOSS HP line — rides combat.js's change-gated #hud-bars write
  if (!B.ready || !B.spawned || B.dead || B.dying || !B.boss.visible) return ''; // review NIT 8: the dying window must not render "BOSS 0%"
  const f = B.hp / B.maxHp;
  return `BOSS ${'▍'.repeat(Math.round(f * 10))} ${Math.ceil(f * 100)}%`;
}
export function probeHold(v) { B.hold = !!v; }
export function probePlace(pos) { B.boss.position.copy(pos); } // probe-only framing setter (boss-shot evidence)
export function probeTargets(fromPos) { // probe aim points: the node (center) and the ring edge nearest the approach
  const u = B.tmp.copy(fromPos).sub(B.boss.position);
  u.y = 0;
  u.normalize();
  const side = B.tmp2.set(-u.z, 0, u.x); // any horizontal perpendicular of the approach line
  return {
    node: B.boss.position.clone(),
    hull: B.boss.position.clone().addScaledVector(side, RING_R),
  };
}
export function probeStats() {
  return {
    phases: [...B.phaseLog],
    weakHits: B.weakHits, bodyHits: B.bodyHits,
    weakDmg: B.weakDmg, bodyDmg: B.bodyDmg,
    chargeDash: B.dashLaunched, overshoot: B.overshootSeen,
    deathSlowmo: B.slowmoSeen,
  };
}
export function clearBoss() { // §8.6 — rides clearCombat: hide + reset; restarts allocate nothing new
  if (!B.ready) return;
  B.spawned = false;
  B.hp = 0;
  B.phase = 'orbit';
  B.phaseLog = [];
  B.volleyT = 0; B.volleyLeft = 0; B.volleyGapT = 0;
  B.chargeT = 0; B.teleT = -1; B.dash = false; B.ramHit = false;
  B.dying = false; B.dead = false; B.deathT = 0; B.boomT = 0;
  B.weakHits = 0; B.bodyHits = 0; B.weakDmg = 0; B.bodyDmg = 0;
  B.dashLaunched = false; B.overshootSeen = false; B.slowmoSeen = false;
  B.hold = false;
  B.boss.visible = false;
}
