// STAGE TWO — combat enemies (S4 core: Drone ram AI). S5 adds Gunner/Burster/Elite.
// Wave composition is DERIVED from the wave number (acceptance #18) — count, speed,
// stagger and wobble are pure functions of w; there is no per-wave table anywhere.
// Drones spawn at the arena edge, seek the ship with a sine wobble, and ram:
// contact damages the player and destroys the drone (no score for being hit).
import { THREE } from 'stage-two-lib';
import { makePool } from './pool.js';

const DRONE_POOL = 24;
const R_DRONE = 0.75; // contact radius (XZ circle)

// derived wave math — the only place difficulty numbers live
export const waveCount = (w) => Math.min(DRONE_POOL, 3 + Math.floor(w * 1.5));
export const waveSpeed = (w) => Math.min(12, 6.5 + w * 0.45);
export const waveStagger = (w) => Math.max(0.25, 1.1 - w * 0.08);
export const waveWobble = (w) => 1.2 + w * 0.06;

const E = { ready: false, scene: null, pool: null, queued: 0, spawnT: 0, speed: 0, wobble: 0, wave: 0 };

function makeDrone() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55),
    new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.5, metalness: 0.55, emissive: 0xff3b2f, emissiveIntensity: 0.55 }));
  hull.scale.y = 1.45;
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
  eye.position.set(0, 0.1, -0.42); // faces the seek direction (−Z local)
  g.add(hull, eye);
  g.userData.hp = 1;
  return g;
}

export function prepareEnemies(scene) {
  if (E.ready) return;
  E.scene = scene;
  E.pool = makePool(scene, makeDrone, DRONE_POOL);
  E.ready = true;
}

export function startWave(w, playerPos) {
  E.wave = w;
  E.speed = waveSpeed(w);
  E.wobble = waveWobble(w);
  E.queued = waveCount(w);
  E.spawnT = waveStagger(w);
  spawnDrone(playerPos); E.queued--; // seed one on the field at once so wave 1 never looks empty
}

function spawnDrone(playerPos) {
  const d = E.pool.spawn();
  // arena edge: ring at radius 30 around the player, random angle
  const a = Math.random() * Math.PI * 2;
  d.position.set(playerPos.x + Math.cos(a) * 30, playerPos.y, playerPos.z + Math.sin(a) * 30);
  d.userData.hp = 1;
  d.userData.phase = Math.random() * Math.PI * 2;
  d.userData.t = 0;
  d.userData.r = R_DRONE;
  return d;
}

function spawnTick(dt, playerPos) {
  if (E.queued <= 0) return;
  E.spawnT -= dt;
  if (E.spawnT <= 0) {
    E.spawnT = waveStagger(E.wave);
    E.queued--;
    spawnDrone(playerPos);
  }
}

// dt already timeScaled by caller. api: { damagePlayer(n), explosion(pos) }
export function tickEnemies(dt, playerPos, api) {
  spawnTick(dt, playerPos);
  E.pool.update(dt, (d) => {
    d.userData.t += dt;
    const dx = playerPos.x - d.position.x, dz = playerPos.z - d.position.z;
    const dist = Math.hypot(dx, dz) || 1; // NaN guard §8.9 — never divide by 0
    // seek + perpendicular sine wobble (unpredictable approach line)
    const ux = dx / dist, uz = dz / dist;
    const w = Math.sin(d.userData.t * 3 + d.userData.phase) * E.wobble;
    d.position.x += (ux * E.speed - uz * w) * dt;
    d.position.z += (uz * E.speed + ux * w) * dt;
    d.lookAt(playerPos.x, d.position.y, playerPos.z);
    d.rotation.z += dt * 2.2;
    if (dist < R_DRONE + 0.9) { // ram: hurt the ship, die without score
      api.damagePlayer(25);
      api.explosion(d.position);
      E.pool.kill(d);
    }
  });
}

// returns true if this hit killed the drone
export function hitDrone(d, dmg = 1) {
  if (!d.userData.alive) return false;
  d.userData.hp -= dmg;
  if (d.userData.hp > 0) return false;
  E.pool.kill(d);
  return true;
}

export function eachAlive(fn) { E.pool.update(0, fn); } // collision scan helper (no dt advance)
export function aliveCount() { return E.pool ? E.pool.live : 0; } // pool is null until combat entry (spin smoke: combatState() threw at title, 2026-11-03)
export function queuedCount() { return E.queued; }
export function spawnForProbe(pos) { // scripted-kill probe: deterministic drone at a given point
  const d = E.pool.spawn();
  d.position.copy(pos);
  d.userData.hp = 1; d.userData.phase = 0; d.userData.t = 0; d.userData.r = R_DRONE;
  return d;
}
export function clearEnemies() {
  if (E.pool) E.pool.clear();
  E.queued = 0; E.spawnT = 0; E.wave = 0;
}
export function droneRadius() { return R_DRONE; }
