// STAGE TWO — combat enemies: RAIDERS (gunners + rammers). Wave composition is DERIVED from
// the wave number (acceptance #18) — count, speed, stagger, wobble and the gunner share are
// pure functions of w — EXCEPT the waves 1-5 KIND split, which is TABLE-driven (story-019,
// GDD §3.5/§9 Decision 3): WAVE_TABLE below is an authored deterministic {gunner, rammer}
// split whose totals equal the derived waveCount exactly (the shipped difficulty curve is
// unchanged; the table's job is the deterministic kind split, replacing the stochastic
// rammerShare roll for waves 1-5). Boundary: wave 5 reads the table, wave 6+ reads the
// derived formulas — wave 6 is the boss gate (boss.js BOSS_WAVE 5: spawnBoss replaces wave
// 6), so the derived fallback serves probes + any future endless mode. A table row is design
// data under review, NOT a hand-kept selector in a guard (the acceptance-#18 resolution):
// the row states the spawn plan — counts are PRE-elite, the elite roll is a per-spawn
// modifier applied after the count is fixed. Raiders are ship-shaped (fuselage, swept
// wings, twin engine glows): GUNNERS hold range, orbit, and fire dodgeable bolts; RAMMERS
// dive and die on impact. §8.6: clearEnemies drains BOTH pools — restarts allocate nothing
// new (restartProbe's relative entity baseline re-primes on its first run).
import { THREE } from 'stage-two-lib';
import { makePool } from './pool.js';

const RAIDER_POOL = 24;
const E_BOLT_POOL = 24;
const R_RAIDER = 0.9;        // contact radius (ram kill / bolt hit — full-3D squared-distance scans, story-015)
const E_BOLT_SPEED = 20;     // dodgeable
const E_BOLT_LIFE = 3;
const SEP_RADIUS = 2.4;      // raiders push apart inside this — no clumping
const RAIDER_ALT_FOLLOW = 1.2; // 1/s — anti-camp altitude trail (story-015, GDD §5.4): raider steering is
// XZ-only, so once the collision scans went 3D a climbing player would strand every raider below and
// trivialize the wave. 40% of the boss's own 3/s y-lerp (boss.js — 1.2/3) so raiders TRAIL altitude
// changes — staying mobile still buys windows of safety.

/* ---------- story-019 elite variants (GDD §3.4, §9 Decision 2: RAIDERS ONLY — gunner +
 * rammer; orbs excluded by design, zero drone.js changes). The chance derives from the wave
 * number — a roll per spawn, never a hand-written elite list (acceptance #18). ---------- */
export const ELITE_MIN_WAVE = 4;   // elites start exactly at the first elite wave (GDD §3.5 table)
export const ELITE_CHANCE = 0.22;  // per spawn, wave ≥ ELITE_MIN_WAVE (curve knob 0.10-0.35)
export const ELITE_SCALE = 1.35;   // model scale — reads "same shape, hotter" at a glance
export const ELITE_TINT = 0xffa02f; // the boss node's amber family — hot = dangerous (GDD §2)
export const ELITE_HP_MULT = 3;    // elite gunner 6 / elite rammer 3 (GDD §4.2 TTK table)
export const ELITE_SPEED_MULT = 1.15; // consumed at the two E.speed sites — non-elites multiply by 1
export const ELITE_SCORE_MULT = 2; // EXPORTED — the kill sites (src/weapons.js since the review-fix split) consume it for the shot-down score; enemies.js is already a weapons.js import (no new edge). Ram deaths never score (the ram is the failure state).
const TRIM_TINT = 0xff3b2f;        // the shipped trim emissive — restored on every spawn (pool reuse)
const GLOW_TINT = 0xff6a3c;        // the shipped engine-glow color — restored on every spawn

// derived wave math — the only place difficulty numbers live
export const waveCount = (w) => Math.min(RAIDER_POOL, 3 + Math.floor(w * 1.5));
export const waveSpeed = (w) => Math.min(12, 6.5 + w * 0.45);
export const waveStagger = (w) => Math.max(0.25, 1.1 - w * 0.08);
export const waveWobble = (w) => 1.2 + w * 0.06;
export const rammerShare = (w) => Math.max(0.25, 0.7 - w * 0.08); // early waves ram-heavy — the DERIVED fallback's split (wave 6+ and any non-tabled wave)

/* ---------- story-019 per-wave composition table (GDD §3.5, §9 Decision 3) ----------
 * The authored waves 1-5 {gunner, rammer} split. Totals equal the derived waveCount exactly
 * (4, 6, 7, 9, 10 — verified per wave), so the difficulty curve is untouched; the table's
 * job is the deterministic kind split. startWave copies the row into a live budget that
 * spawnRaider drains GUNNER-FIRST (the row states the multiset; the drain order is the
 * table's deterministic reading). Counts are PRE-elite: the elite roll is a per-spawn
 * modifier applied after the count is fixed. */
export const TABLE_MAX_WAVE = 5; // the boss gate is wave 6 (combat.js) — the table covers the natural path
export const WAVE_TABLE = {
  1: { gunner: 1, rammer: 3 }, // teaches rammers (dodge) + one gunner demonstrates bolts
  2: { gunner: 2, rammer: 4 }, // gunner pressure doubles; pure dodge-and-shoot wave
  3: { gunner: 3, rammer: 4 }, // the orb's scaffolded intro — exactly one (droneCountFor)
  4: { gunner: 4, rammer: 5 }, // first elite wave — the chance starts exactly here
  5: { gunner: 5, rammer: 5 }, // the pre-boss exam: max orbs, gunner-heavy, elites live
};
// the resolution the harness reads: source 'table' for the authored range, 'derived' beyond
// it — the boundary asserted BOTH ways (wave 5 table, wave 6+ the untouched fallback).
export function waveComposition(w) {
  const row = w <= TABLE_MAX_WAVE ? WAVE_TABLE[w] : undefined;
  if (row) return { gunner: row.gunner, rammer: row.rammer, total: row.gunner + row.rammer, source: 'table' };
  return { total: waveCount(w), source: 'derived' };
}

const E = { ready: false, scene: null, pool: null, bolts: null, queued: 0, spawnT: 0, speed: 0, wobble: 0, wave: 0, waveTable: null, lastRoll: null, scratch: [] };

function makeRaider() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x39424f, roughness: 0.5, metalness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xff5238, roughness: 0.55, emissive: TRIM_TINT, emissiveIntensity: 0.5 }); // the shipped look IS the reset contract's restore values — one source (quality review 2026-11-07)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.3, 8), hull);
  body.rotation.x = Math.PI / 2; // long axis along Z — lookAt points +Z at the player
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 8), trim);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.82;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.55), hull);
  wing.position.z = -0.1;
  const finL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.4), trim);
  finL.position.set(-0.95, 0.2, -0.35);
  const finR = finL.clone();
  finR.position.x = 0.95;
  const glowMat = new THREE.SpriteMaterial({ color: GLOW_TINT, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }); // same single-source contract as TRIM_TINT above
  const glowL = new THREE.Sprite(glowMat);
  glowL.scale.setScalar(0.5);
  glowL.position.set(-0.28, 0, -0.75);
  const glowR = new THREE.Sprite(glowMat);
  glowR.scale.setScalar(0.5);
  glowR.position.set(0.28, 0, -0.75);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb08f }));
  eye.position.set(0, 0.06, 0.55);
  g.add(body, nose, wing, finL, finR, glowL, glowR, eye);
  g.userData.trim = trim; // story-019: per-instance materials (created above) — the elite retint + the unconditional spawn reset need live handles
  g.userData.glow = glowMat;
  return g;
}

function makeEBolt() {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.11, 1.5),
    new THREE.MeshBasicMaterial({ color: 0xff7a55, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.userData.dir = new THREE.Vector3();
  m.userData.life = 0;
  return m;
}

export function prepareEnemies(scene) {
  if (E.ready) return;
  E.scene = scene;
  E.pool = makePool(scene, makeRaider, RAIDER_POOL);
  E.bolts = makePool(scene, makeEBolt, E_BOLT_POOL);
  E.ready = true;
}

export function startWave(w, playerPos) {
  E.wave = w;
  // story-019: the boundary rule lives in ONE place — waveComposition — and the spawn path
  // consumes it, so the harness's waveComposition().source asserts describe exactly what the
  // spawner honors (a one-sided future edit cannot split them; quality review 2026-11-07).
  const comp = waveComposition(w);
  E.waveTable = comp.source === 'table' ? { gunner: comp.gunner, rammer: comp.rammer } : null; // a COPY — the live kind budget spawnRaider drains; the authored row stays pristine
  E.speed = waveSpeed(w);
  E.wobble = waveWobble(w);
  E.queued = waveCount(w); // the curve stays authoritative: totals equal the table row by design (the harness asserts it)
  E.spawnT = waveStagger(w);
  spawnRaider(playerPos); E.queued--; // seed one on the field at once so wave 1 never looks empty
}

function stampElite(d) { // story-019: the elite variant stamps — only ever called from the spawn path AFTER the unconditional reset below, so a former elite's stale state can never compound
  const u = d.userData;
  u.elite = true;
  u.hp *= ELITE_HP_MULT;
  u.speedMult = ELITE_SPEED_MULT; // consumed at the two E.speed sites (gunner vRadial/vTang, rammer sp)
  d.scale.setScalar(ELITE_SCALE);
  u.r = R_RAIDER * ELITE_SCALE; // STAMPED + PROBE-VISIBLE ONLY (quality review 2026-11-07, orchestrator ruling): NO collision scan consumes it yet — the bolt scan uses the fixed 1.1 radius² (weapons.js) and ram contact (R_RAIDER + 0.9)² (below); wiring it in is a DEFERRED game-design decision (a bigger elite hitbox = a balance change) for the evidence-driven balance pass this story's telemetry enables
  u.trim.emissive.setHex(ELITE_TINT);
  u.glow.color.setHex(ELITE_TINT);
}

function spawnRaider(playerPos, forceKind) {
  const d = E.pool.spawn();
  // spawn ring OUTSIDE the camera view — 55 out with the 80 arena (was 30/26)
  const a = Math.random() * Math.PI * 2;
  d.position.set(playerPos.x + Math.cos(a) * 55, playerPos.y, playerPos.z + Math.sin(a) * 55);
  let kindDraw = null;
  let kind;
  if (forceKind) kind = forceKind;
  else if (E.waveTable) { kindDraw = null; kind = E.waveTable.gunner > 0 ? 'gunner' : 'rammer'; E.waveTable[kind]--; } // story-019: the table's deterministic split — the gunner budget drains first
  else { kindDraw = Math.random(); kind = kindDraw < rammerShare(E.wave) ? 'rammer' : 'gunner'; } // derived fallback (wave 6+): the stochastic split, untouched
  d.userData.kind = kind;
  d.userData.hp = kind === 'gunner' ? 2 : 1;
  // story-019: UNCONDITIONAL per-spawn reset BEFORE any elite stamping — the pool reuses
  // instances, so a former elite's stale scale/tint/flag/speed/r must never leak into a
  // normal spawn. The bad state is made unrepresentable here, not patched at the use sites.
  const u = d.userData;
  u.elite = false;
  u.speedMult = 1;
  d.scale.setScalar(1);
  u.r = R_RAIDER;
  u.trim.emissive.setHex(TRIM_TINT);
  u.glow.color.setHex(GLOW_TINT);
  d.userData.phase = Math.random() * Math.PI * 2;
  d.userData.t = 0;
  // (the old per-spawn `d.userData.r = R_RAIDER` line was removed — the reset block's
  // `u.r = R_RAIDER` above already sets it; quality review 2026-11-07 nit)
  const hold = 16 + Math.random() * 8;           // gunner hold range
  d.userData.hold = hold;
  const orbit = Math.random() < 0.5 ? 1 : -1;
  d.userData.orbitDir = orbit;
  const fireT = 1.2 + Math.random();             // first shot delay
  d.userData.fireT = fireT;
  d.rotation.set(0, 0, 0);
  // story-019: the elite roll — raiders only, derived from the wave (GDD §3.4). Probe-forced
  // kinds (spawnForProbe's determinism contract with the other walks) never roll.
  // MERGE-HALT DIAGNOSTIC (2026-11-07): the draw is captured to E.lastRoll — the balance
  // drive's rate stage reads it IMMEDIATELY after each spawn (no intervening Math.random in
  // between: the read is synchronous in the same tick), pairing the exact uniform with the
  // flag the drive counts. Behavior-identical: still exactly the same Math.random calls in
  // the same order per guarded spawn, same short-circuit, same distribution. Round 2: ALL
  // SIX consumers of the spawn's draw block are captured at their original sites (angle/
  // kind/hold/orbitDir/fireT/elite) — if an anomalous batch's skew is STREAM-wide, the five
  // siblings skew WITH the elite draw; if only the elite draw skews, the anomaly is
  // stride-position-specific (xorshift128+ structure, not stream state).
  let eliteDraw = null, rolled = false;
  if (!forceKind && E.wave >= ELITE_MIN_WAVE) {
    eliteDraw = Math.random();
    rolled = eliteDraw < ELITE_CHANCE;
  }
  E.lastRoll = {
    draw: eliteDraw, rolled, wave: E.wave,
    skipped: forceKind ? 'forceKind' : (eliteDraw === null ? 'wave' : null),
    sib: { angle: a, kindDraw, hold, orbit, fireT },
  };
  if (rolled) stampElite(d);
  return d;
}

function spawnTick(dt, playerPos) {
  if (E.queued <= 0) return;
  E.spawnT -= dt;
  if (E.spawnT <= 0) {
    E.spawnT = waveStagger(E.wave);
    E.queued--;
    spawnRaider(playerPos);
  }
}

function tickBolts(dt, playerPos, api) {
  E.bolts.update(dt, (b) => {
    b.userData.life -= dt;
    b.position.addScaledVector(b.userData.dir, E_BOLT_SPEED * dt);
    if (b.userData.life <= 0) { E.bolts.kill(b); return; }
    // story-015: full-3D hit — the XZ-only form hit through ANY vertical separation (a bolt
    // 30 u above the ship still "hit" once the ship can pitch)
    const dx = playerPos.x - b.position.x, dy = playerPos.y - b.position.y, dz = playerPos.z - b.position.z;
    if (dx * dx + dy * dy + dz * dz < 1.4) { // hit the ship
      E.bolts.kill(b);
      api.damagePlayer(12, 'bolt'); // story-019: the honest source tag — gunner fire AND the boss volley ride this same pool + scan, so both honestly merge into 'bolt' (GDD §3.7)
      api.explosion(b.position);
    }
  });
}

// dt already timeScaled by caller. api: { damagePlayer(n), explosion(pos) }
export function tickEnemies(dt, playerPos, api) {
  spawnTick(dt, playerPos);
  // frame-start snapshot of live raiders — pool.js keeps its items private, and a single
  // top-level dt=0 scan leaves the pool's live count correct for the main update after it
  E.scratch.length = 0;
  E.pool.update(0, (o) => E.scratch.push(o));
  E.pool.update(dt, (d) => {
    const u = d.userData;
    u.t += dt;
    // story-015 altitude-follow (GDD §5.4 anti-camp): boss.js's own altitude-lerp pattern at
    // 40% rate (1.2/3) — the ONE line that keeps a climbing player from stranding the wave
    d.position.y += (playerPos.y - d.position.y) * (1 - Math.exp(-RAIDER_ALT_FOLLOW * dt));
    const dx = playerPos.x - d.position.x, dy = playerPos.y - d.position.y, dz = playerPos.z - d.position.z;
    // dx/dz stay the STEERING basis (raider steering is XZ-only by design, GDD §5.4); dy rides
    // along for the 3D ram contact below (story-015)
    const dist = Math.hypot(dx, dz) || 1; // NaN guard §8.9 — never divide by 0
    const ux = dx / dist, uz = dz / dist;

    // separation — pairwise push inside SEP_RADIUS (pool is small, brute force is honest).
    // story-016 rider R-f: the metric gains the dy term (full 3D) — XZ-only separation stacks
    // raiders vertically now that altitude-follow (015) exists, and two raiders at one XZ
    // would grind on the same spot forever (ox=oz=0 excluded the pair from the push entirely).
    let sx = 0, sy = 0, sz = 0;
    for (const o of E.scratch) {
      if (o === d || !o.userData.alive) continue;
      const ox = d.position.x - o.position.x, oy = d.position.y - o.position.y, oz = d.position.z - o.position.z;
      const d2 = ox * ox + oy * oy + oz * oz;
      if (d2 < SEP_RADIUS * SEP_RADIUS && d2 > 0.0001) {
        const inv = 1 / Math.sqrt(d2);
        const push = SEP_RADIUS - Math.sqrt(d2);
        sx += ox * inv * push;
        sy += oy * inv * push;
        sz += oz * inv * push;
      }
    }
    d.position.x += sx * dt * 2.2;
    d.position.y += sy * dt * 2.2;
    d.position.z += sz * dt * 2.2;

    if (u.kind === 'gunner') {
      // hold the ring: radial error drives approach/backoff, tangential velocity orbits
      const err = dist - u.hold;
      const vRadial = Math.max(-E.speed, Math.min(E.speed, err * 0.8)) * u.speedMult; // story-019: elite ×1.15 (non-elites ×1 — zero diff)
      const vTang = u.orbitDir * E.speed * 0.7 * u.speedMult; // story-019: elite ×1.15
      d.position.x += (ux * vRadial - uz * vTang) * dt;
      d.position.z += (uz * vRadial + ux * vTang) * dt;
      d.lookAt(playerPos.x, d.position.y, playerPos.z);
      d.rotation.z = Math.sin(u.t * 4) * 0.25; // banking sway
      u.fireT -= dt;
      if (u.fireT <= 0 && dist < 34) {
        u.fireT = 1.6 + Math.random() * 0.6;
        const b = E.bolts.spawn();
        b.position.copy(d.position);
        b.userData.dir.set(dx, 0, dz).normalize();
        b.userData.dir.x += (Math.random() - 0.5) * 0.06; // spread — bursts are dodgeable, not perfect
        b.userData.dir.z += (Math.random() - 0.5) * 0.06;
        b.userData.dir.normalize();
        b.userData.life = E_BOLT_LIFE;
        b.lookAt(b.position.clone().add(b.userData.dir));
      }
    } else { // rammer: seek + perpendicular sine wobble, dies on impact
      const w = Math.sin(u.t * 3 + u.phase) * E.wobble;
      const sp = E.speed * 1.15 * u.speedMult; // story-019: elite ×1.15 on top of the rammer's own 1.15 (≤ 15.9 u/s at the wave-speed cap 12 — still dodgeable, GDD §4.4)
      d.position.x += (ux * sp - uz * w) * dt;
      d.position.z += (uz * sp + ux * w) * dt;
      d.lookAt(playerPos.x, d.position.y, playerPos.z);
      d.rotation.z = Math.sin(u.t * 5 + u.phase) * 0.3;
      if (dx * dx + dy * dy + dz * dz < (R_RAIDER + 0.9) * (R_RAIDER + 0.9)) { // ram: hurt the ship, die without score — story-015: full-3D contact (the XZ-only form rammed through any vertical separation)
        api.damagePlayer(25, 'ram'); // story-019: the honest source tag — an elite ram denies score the same as a normal one (the ram is the failure state)
        api.explosion(d.position);
        E.pool.kill(d);
        return;
      }
    }
  });
  tickBolts(dt, playerPos, api);
}

// returns true if this hit killed the raider
export function hitDrone(d, dmg = 1) {
  if (!d.userData.alive) return false;
  d.userData.hp -= dmg;
  if (d.userData.hp > 0) return false;
  E.pool.kill(d);
  return true;
}

export function eachAlive(fn) { E.pool.update(0, fn); } // collision scan helper (no dt advance)

// story-013 (the story's ONE pre-authorized change here): the boss volley fires through this
// helper into the SAME dodgeable bolt pool — identical speed/spread/player-hit rule as gunner
// fire, zero new allocation (clearEnemies already drains E.bolts on every combat exit).
export function fireEBolt(fromPos, dir) {
  if (!E.bolts) return false;
  const b = E.bolts.spawn();
  b.position.copy(fromPos);
  b.userData.dir.copy(dir).normalize();
  b.userData.life = E_BOLT_LIFE;
  b.lookAt(b.position.clone().add(b.userData.dir));
  return true;
}
export function aliveCount() { return E.pool ? E.pool.live : 0; } // pools are null until combat entry
export function eboltCount() { return E.bolts ? E.bolts.live : 0; }
export function queuedCount() { return E.queued; }
export function spawnForProbe(pos) { // scripted-kill probe: deterministic rammer at a given point
  const d = spawnRaider(pos, 'rammer');
  d.position.copy(pos);
  return d;
}
export function lastRollProbe() { return E.lastRoll; } // MERGE-HALT DIAGNOSTIC (2026-11-07): the last spawn's elite-roll draw — read by the balance drive's rate stage immediately after each spawn (the drive's per-roll record pairs it with the flag it counts; see probes-balance.js case 8)
export function spawnRaiderForProbe(pos, wave, forceElite, forceKind) { // story-019 probe seam (spawnForProbe/forceDropForProbe precedent): the wave param drives the REAL spawn path's elite roll (the rate asserts need real Math.random rolls at a forced wave ≥ ELITE_MIN_WAVE — no seeded RNG exists, architecture §7.1); forceElite stamps the variant for the stat asserts when the real roll missed; forceKind pins the kind for the per-kind stat asserts (the base hp stamps BEFORE the elite multiply, so an elite gunner reads hp 6). With no forceKind the kind roll stays real. Probe spawns never consume a table row (the split asserts own that budget).
  const wSave = E.wave, tSave = E.waveTable;
  if (wave != null) E.wave = wave;
  E.waveTable = null;
  const d = spawnRaider(pos, forceKind);
  E.wave = wSave; E.waveTable = tSave;
  d.position.copy(pos);
  if (forceElite && !d.userData.elite) stampElite(d);
  return d;
}
export function clearEnemies() {
  if (E.pool) E.pool.clear();
  if (E.bolts) E.bolts.clear();
  E.queued = 0; E.spawnT = 0; E.wave = 0;
  E.waveTable = null; // story-019: the kind budget dies with the wave — probe spawns after a clear never consume a row
}
export function droneRadius() { return R_RAIDER; }
