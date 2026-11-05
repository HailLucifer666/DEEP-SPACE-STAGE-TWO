// STAGE TWO — combat pickups (story-018, GDD §3.3): killed enemies drop timed powerups.
// ENTITY-side only (architecture §7.1): the drop roll, the pickup pool (makePool contract —
// reuse-first, steal-oldest at saturation, kill() the single retirement path), despawn/blink
// and the full-3D pickup check. The EFFECT side (timers, apply, expire) lives in src/combat.js
// — powerups.js NEVER reads combat state (acyclic by construction): it imports stage-two-lib +
// pool.js only, and combat.js composes the `picked` api it calls back through.
// Drop sites (the ONLY callers of maybeDrop): the two bolt-kill sites in combat.js boltsTick —
// raider + orb. Ram/dive deaths self-kill inside enemies.js/drone.js (not in this story's file
// list), so "on kill" reads as "player-killed" — rams never roll. The boss is exempt from
// drops (no call site in the boss path) but effects must still WORK during the boss fight.
// Sound-free by contract: the pickup blip plays from combat.js's api.picked target.
import { THREE } from 'stage-two-lib';
import { makePool } from './pool.js';

/* ---------- tuning knobs (design: one-shot-work/HANDOFF.md L227 inherited verbatim + GDD §3.3/§7) ---------- */
export const DROP_CHANCE = 0.18; // per player-kill — retune WITH story-019's telemetry, not before
export const PICKUP_LIFE = 8;    // s of ground life before despawn
export const PICKUP_BLINK = 2;   // s — blink during the LAST 2 s
export const PICKUP_RADIUS = 1.4; // pickup check radius — FULL-3D squared distance (the story-015 lesson: never XZ-only)
export const EFFECT_T = 8;       // s an effect lasts; same-kind re-pickup REFRESHES to this (never stacks)
export const PICKUP_POOL = 6;    // GDD §7 number — ~1.8 drops/wave expected (§4.3); steal-oldest caps the rest
export const KINDS = ['SPREAD', 'OVERDRIVE', 'SHIELD']; // uniform 1/3 kind roll (GDD §3.3 least-assumption reading)

const KIND_COLOR = { SPREAD: 0x7dd7ff, OVERDRIVE: 0xffa02f, SHIELD: 0x7dffb0 }; // cyan / amber / green — one hue per effect, mirrored by the HUD chips

// story-019's read surface (GDD §3.7: "pickup fields read story-018's surfaces"). Event-driven
// counters only — incremented at the roll/overlap/despawn sites, never per-frame. Per-page
// cumulative (reset once at prepare); the probe drive reads deltas between stages.
const STATS = { dropped: 0, picked: 0, expired: 0, byKind: { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 } };

const P = { ready: false, scene: null, pool: null };

// The pickup entity: a rotating additive gem (octahedron core + additive sprite halo,
// depthWrite:false — the neon convention). A MESH core is deliberate: countMeshes() counts
// isMesh only, and the architecture's "pickups join the entity baseline" contract (§8.6 /
// restartProbe) must be observable — a bare THREE.Sprite would be invisible to it.
function makePickup() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.5, 0),
    new THREE.MeshBasicMaterial({ color: 0x7dd7ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x7dd7ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(1.8);
  g.add(core, halo);
  g.userData.core = core;
  g.userData.halo = halo;
  g.userData.t = 0; // age — drives the blink window + despawn
  return g;
}

export function preparePowerups(scene) {
  if (P.ready) return;
  P.ready = true;
  P.scene = scene;
  P.pool = makePool(scene, makePickup, PICKUP_POOL);
  // Pre-warm all 6 entities ONCE (spawn + immediate kill): the meshes join the combat baseline
  // deterministically at first prepare, so restartProbe's relative baseline stays clean:true
  // (§8.6 — restarts allocate nothing new; the baseline RISES by 6, recorded same-build).
  for (let i = 0; i < PICKUP_POOL; i++) P.pool.kill(P.pool.spawn());
}

function spawnPickup(pos, kind) {
  const it = P.pool.spawn();
  it.position.copy(pos);
  const u = it.userData;
  u.kind = kind;
  u.t = 0;
  u.blink = false;
  u.core.material.color.setHex(KIND_COLOR[kind]);
  u.halo.material.color.setHex(KIND_COLOR[kind]);
  return it;
}

// The drop roll — called from combat.js's two bolt-kill sites ONLY. One roll, at most one
// pickup per kill (GDD §8.3). Position arrives pre-clamped from combat.js (r3 ≤ R_HARD − 1:
// orbs can die outside the sphere, an unclamped drop would be unreachable behind the hard
// clamp — GDD §3.3/§5).
export function maybeDrop(pos) {
  if (!P.ready || !P.pool) return false;
  if (Math.random() >= DROP_CHANCE) return false;
  const kind = KINDS[(Math.random() * KINDS.length) | 0]; // uniform 1/3
  spawnPickup(pos, kind);
  STATS.dropped++;
  STATS.byKind[kind]++;
  return true;
}

// Probe-only deterministic spawn (spawnForProbe precedent) — bypasses the roll and the kind
// rng; NO seeded RNG is invented for this (architecture §7.1 honest flag). Rate asserts run
// REAL rolls over N forced kills; the kind/effect asserts use this.
export function forceDropForProbe(pos, kind) {
  if (!P.ready || !P.pool) return null;
  return spawnPickup(pos, kind);
}

// dt already timeScaled by the caller. api: { picked(kind) } — composed by combat.js
// (applyEffect + pickup blip); powerups.js never imports combat state.
export function tickPowerups(dt, playerPos, api) {
  if (!P.ready || !P.pool) return;
  P.pool.update(dt, (it) => {
    const u = it.userData;
    u.t += dt;
    it.rotation.y += dt * 2.4; // the spin reads "alive" against the dressing field
    it.rotation.x += dt * 0.9;
    const blink = u.t >= PICKUP_LIFE - PICKUP_BLINK; // blink the LAST 2 s
    if (blink !== u.blink) u.blink = blink;
    const o = blink ? (Math.sin(u.t * 16) > 0 ? 0.95 : 0.15) : 0.9;
    u.core.material.opacity = o;
    u.halo.material.opacity = o * 0.55;
    if (u.t >= PICKUP_LIFE) { // despawn at ground-life end
      P.pool.kill(it);
      STATS.expired++;
      return;
    }
    // pickup detection — FULL-3D squared distance (story-015 lesson: never XZ-only)
    const dx = playerPos.x - it.position.x, dy = playerPos.y - it.position.y, dz = playerPos.z - it.position.z;
    if (dx * dx + dy * dy + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
      const kind = u.kind;
      P.pool.kill(it);
      STATS.picked++;
      api.picked(kind);
    }
  });
}

export function clearPowerups() { // §8.6 — rides clearCombat beside every other pool drain
  if (P.pool) P.pool.clear();
}

/* ---------- probe surface ---------- */
export function eachAlive(fn) { if (P.pool) P.pool.update(0, fn); } // collision-scan helper (no dt advance)
export function liveCount() { return P.pool ? P.pool.live : 0; }
export function stats() {
  return { dropped: STATS.dropped, picked: STATS.picked, expired: STATS.expired, byKind: { ...STATS.byKind } };
}
