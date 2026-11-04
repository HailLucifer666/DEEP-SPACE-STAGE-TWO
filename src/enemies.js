// STAGE TWO — combat enemies: RAIDERS (gunners + rammers). Wave composition is DERIVED from
// the wave number (acceptance #18) — count, speed, stagger, wobble and the gunner share are
// pure functions of w; there is no per-wave table anywhere. Raiders are ship-shaped (fuselage,
// swept wings, twin engine glows): GUNNERS hold range, orbit, and fire dodgeable bolts;
// RAMMERS dive and die on impact. §8.6: clearEnemies drains BOTH pools — restarts allocate
// nothing new (restartProbe's relative entity baseline re-primes on its first run).
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

// derived wave math — the only place difficulty numbers live
export const waveCount = (w) => Math.min(RAIDER_POOL, 3 + Math.floor(w * 1.5));
export const waveSpeed = (w) => Math.min(12, 6.5 + w * 0.45);
export const waveStagger = (w) => Math.max(0.25, 1.1 - w * 0.08);
export const waveWobble = (w) => 1.2 + w * 0.06;
export const rammerShare = (w) => Math.max(0.25, 0.7 - w * 0.08); // early waves ram-heavy

const E = { ready: false, scene: null, pool: null, bolts: null, queued: 0, spawnT: 0, speed: 0, wobble: 0, wave: 0, scratch: [] };

function makeRaider() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x39424f, roughness: 0.5, metalness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xff5238, roughness: 0.55, emissive: 0xff3b2f, emissiveIntensity: 0.5 });
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
  const glowMat = new THREE.SpriteMaterial({ color: 0xff6a3c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowL = new THREE.Sprite(glowMat);
  glowL.scale.setScalar(0.5);
  glowL.position.set(-0.28, 0, -0.75);
  const glowR = new THREE.Sprite(glowMat);
  glowR.scale.setScalar(0.5);
  glowR.position.set(0.28, 0, -0.75);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb08f }));
  eye.position.set(0, 0.06, 0.55);
  g.add(body, nose, wing, finL, finR, glowL, glowR, eye);
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
  E.speed = waveSpeed(w);
  E.wobble = waveWobble(w);
  E.queued = waveCount(w);
  E.spawnT = waveStagger(w);
  spawnRaider(playerPos); E.queued--; // seed one on the field at once so wave 1 never looks empty
}

function spawnRaider(playerPos, forceKind) {
  const d = E.pool.spawn();
  // spawn ring OUTSIDE the camera view — 55 out with the 80 arena (was 30/26)
  const a = Math.random() * Math.PI * 2;
  d.position.set(playerPos.x + Math.cos(a) * 55, playerPos.y, playerPos.z + Math.sin(a) * 55);
  const kind = forceKind || (Math.random() < rammerShare(E.wave) ? 'rammer' : 'gunner');
  d.userData.kind = kind;
  d.userData.hp = kind === 'gunner' ? 2 : 1;
  d.userData.phase = Math.random() * Math.PI * 2;
  d.userData.t = 0;
  d.userData.r = R_RAIDER;
  d.userData.hold = 16 + Math.random() * 8;      // gunner hold range
  d.userData.orbitDir = Math.random() < 0.5 ? 1 : -1;
  d.userData.fireT = 1.2 + Math.random();        // first shot delay
  d.rotation.set(0, 0, 0);
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
      api.damagePlayer(12);
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

    // separation — pairwise push inside SEP_RADIUS (pool is small, brute force is honest)
    let sx = 0, sz = 0;
    for (const o of E.scratch) {
      if (o === d || !o.userData.alive) continue;
      const ox = d.position.x - o.position.x, oz = d.position.z - o.position.z;
      const d2 = ox * ox + oz * oz;
      if (d2 < SEP_RADIUS * SEP_RADIUS && d2 > 0.0001) {
        const inv = 1 / Math.sqrt(d2);
        sx += ox * inv * (SEP_RADIUS - Math.sqrt(d2));
        sz += oz * inv * (SEP_RADIUS - Math.sqrt(d2));
      }
    }
    d.position.x += sx * dt * 2.2;
    d.position.z += sz * dt * 2.2;

    if (u.kind === 'gunner') {
      // hold the ring: radial error drives approach/backoff, tangential velocity orbits
      const err = dist - u.hold;
      const vRadial = Math.max(-E.speed, Math.min(E.speed, err * 0.8));
      const vTang = u.orbitDir * E.speed * 0.7;
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
      const sp = E.speed * 1.15;
      d.position.x += (ux * sp - uz * w) * dt;
      d.position.z += (uz * sp + ux * w) * dt;
      d.lookAt(playerPos.x, d.position.y, playerPos.z);
      d.rotation.z = Math.sin(u.t * 5 + u.phase) * 0.3;
      if (dx * dx + dy * dy + dz * dz < (R_RAIDER + 0.9) * (R_RAIDER + 0.9)) { // ram: hurt the ship, die without score — story-015: full-3D contact (the XZ-only form rammed through any vertical separation)
        api.damagePlayer(25);
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
export function clearEnemies() {
  if (E.pool) E.pool.clear();
  if (E.bolts) E.bolts.clear();
  E.queued = 0; E.spawnT = 0; E.wave = 0;
}
export function droneRadius() { return R_RAIDER; }
