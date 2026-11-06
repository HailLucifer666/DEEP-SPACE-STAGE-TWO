// STAGE TWO — WEAPONS (review-fix split from src/combat.js, story-018 review round): the fire
// path + projectile/effect side. Owns: the bolt factory + the bolt pool's flight/hit resolution
// (boltsTick), the two-stage trigger (spawnBolt/spawnStreamShot/fireTick — GDD §3.1 threshold
// spray-then-charge), the drop roll's kill-site seam (dropAt), and the pickup EFFECT side
// (applyEffect + the effect-timer loop, architecture §7.2 — the timers' STATE stays on the
// combat.js player object; the code that reads/writes it lives here). STRICTLY behavior-neutral
// verbatim move (the R-c playbook, architecture §6): same statements, same order, same comments
// — combat.js calls fireTick/boltsTick/effectsTick at the SAME tickCombat positions, and composes
// POWERUP_API around the imported applyEffect exactly as before.
//
// THE SEAM (the C-state contract): combat.js's state bag C is module-local THERE — initWeapons()
// receives it ONCE as a LIVE reference, so every C.* read in this module is a CALL-TIME read
// (C.bolts, C.rocket, C.api, C.bossApi are assigned asynchronously in prepareCombat — the
// never-snapshot rule: passing the object, never copies, is what keeps this seam honest).
// forward/noseWorld ride the same call — live closures over C, the same function identities
// probeEnv hands probes.js. ARENA_Y/R_HARD/SHIELD_MAX are const primitives in combat.js —
// immutable for the page's lifetime, so init-time copies are snapshot-safe by construction.
// Import discipline (dep-check — acyclic, nothing imports main.js): weapons.js imports the same
// leaves combat.js already consumes (enemies/drone/boss/effects/powerups/audio); the only
// importer of weapons.js is combat.js.
import { THREE } from 'stage-two-lib';
import * as ENEMIES from './enemies.js';
import * as DRONES from './drone.js';
import * as BOSS from './boss.js';
import * as EFFECTS from './effects.js';
import * as POWERUPS from './powerups.js';
import { EFFECT_T, KINDS as EFFECT_KINDS } from './powerups.js';
import { beep, sweep, noiseBurst, chargeWhine, chargeRelease, pickupBlip, expireBlip } from './audio.js'; // story-018: named synth recipes (audio.js) — the fire path owns the crossing/release voices, the effect side owns the pickup/expire blips; powerups.js stays sound-free

/* ---------- the seam (see the header) ---------- */
let C = null; // combat.js's live state bag — set once by initWeapons, read at CALL TIME
let forward = null; // combat.js's 3D forward closure (story-015 keystone) — live, never copied
let noseWorld = null; // combat.js's nose closure — live, never copied
let ARENA_Y = 0, R_HARD = 0, SHIELD_MAX = 0; // const primitives in combat.js — immutable, snapshot-safe

export function initWeapons(deps) {
  C = deps.C;
  forward = deps.forward;
  noseWorld = deps.noseWorld;
  ARENA_Y = deps.ARENA_Y;
  R_HARD = deps.R_HARD;
  SHIELD_MAX = deps.SHIELD_MAX;
}

const FIRE_INTERVAL = 1 / 8; // ~8/s hold-fire
const BOLT_SPEED = 42;
export const BOLT_LIFE = 1.2; // exported — combat.js's scriptedKill path + probeEnv still read it (review-fix split)
// story-018 charged shot (GDD §3.1-3.2, §7 — threshold spray-then-charge, the resolved
// Decision 1): ONE trigger, two stages. Below T_CHARGE of continuous LMB hold the stream fires
// exactly as shipped (first bolt on the press frame); AT the threshold the stream suppresses
// and the charge fills; release at/after the threshold fires exactly ONE charged bolt; release
// before it fires nothing extra (the stream already did the work — no partial charge).
export const T_CHARGE = 0.6;   // s of continuous hold before suppression + charge fill (feel knob 0.45-0.9) — exported: combat.js's combatState charge read + the reticle meter still divide by it (review-fix split)
const CHARGE_DAMAGE = 6;       // charged bolt damage — elite-gunner one-shot anchor; boss weak point 6×3 = 18 (curve knob 4-8)
const CHARGE_SCALE = 3.0;      // charged bolt visual scale ×3 — readable under the shipped bloom chain
const SUPPRESS_STREAM = true;  // DESIGN CONST, not a knob: the balance hinge (GDD §3.1) — stream+charge together is a dominant strategy
const BOLT_COLOR = 0x9fe8ff;   // shipped stream bolt color
const CHARGE_COLOR = 0xffc85a; // charged bolt — the amber family (the boss node's color language, GDD §3.2)
// story-018 effect knobs (GDD §7 places SPREAD_ANGLE/OVERDRIVE_DIV with the fire path's owner —
// review-fix round 2026-11-06: that owner is THIS module; EFFECT_T lives in powerups.js with
// the other pickup consts)
const SPREAD_ARC = 6;          // degrees — ±6° three-bolt fan per stream shot while SPREAD is active
const OVERDRIVE_DIV = 2.2;     // stream interval ÷ 2.2 while OVERDRIVE is active — T_CHARGE unchanged (GDD §3.2)
const SCORE_DRONE = 100, SCORE_GUNNER = 150;
// story-012: the Vi3W drone's kill score. SCORE_DRONE above is the RAIDERS' historical rammer
// score — the name collision is pre-existing (enemies.js hitDrone/droneRadius too); those
// names stay untouched per the story. The new enemy's kind is 'orb', its score lives here.
const SCORE_ORB = 200;

export function makeBolt() { // the factory rides with the fire path; combat.js's prepareCombat still owns the pool CREATION (makePool(scene, makeBolt, BOLT_POOL) — BOLT_POOL stays there)
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.09, 1.7),
    new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.userData.dir = new THREE.Vector3();
  m.userData.life = 0;
  return m;
}

/* ---------- weapons — story-018: ONE trigger, two stages (GDD §3.1 threshold spray-then-charge) ---------- */

// story-018: one spawner for both stages — stream (dmg 1, cyan, scale 1) and charged
// (dmg CHARGE_DAMAGE, amber family, scale ×3, single-hit — same pool, same BOLT_SPEED, no
// pierce). Pool reuse resets the visual identity every spawn: a reused slot must not inherit
// the previous bolt's look. userData.dmg threads through every hit site (raider/orb/boss);
// probe-spawned unstamped bolts read `|| 1` at the sites (scriptedKill/bossProbe stay exact).
function spawnBolt(dmg, charged, dir) {
  const b = C.bolts.spawn();
  noseWorld(b.position);
  if (dir) b.userData.dir.copy(dir); else forward(b.userData.dir);
  b.userData.life = BOLT_LIFE;
  b.userData.dmg = dmg;
  b.userData.charged = charged;
  b.lookAt(C.tmp.copy(b.position).add(b.userData.dir));
  b.scale.setScalar(charged ? CHARGE_SCALE : 1);
  b.material.color.setHex(charged ? CHARGE_COLOR : BOLT_COLOR);
  return b;
}

// story-018 fan scratch (module-level — no per-shot allocation). The fan rotates the shot's
// forward ±SPREAD_ARC about the SHIP'S LOCAL UP (kept perpendicular to forward, so the angle
// between the dirs is exactly ±6° at any pitch — a world-up rotation would narrow the fan at
// high pitch). The charged bolt is NEVER fanned (GDD §3.2: 3×6 = 18 alpha per cycle would
// break the DPS parity anchor). NOTE: the center dir is copied OUT of C.tmp first — spawnBolt's
// lookAt clobbers C.tmp, so a second spawnBolt(dir) reading C.tmp would fly a garbage direction.
const FAN = { right: new THREE.Vector3(), up: new THREE.Vector3(), left: new THREE.Vector3(), rightD: new THREE.Vector3(), center: new THREE.Vector3() };
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function spawnStreamShot() {
  const d0 = forward(C.tmp); // center dir
  if (C.effects.SPREAD > 0) {
    FAN.right.copy(d0).cross(WORLD_UP).normalize();
    FAN.up.copy(FAN.right).cross(d0).normalize();
    const a = SPREAD_ARC * Math.PI / 180;
    FAN.left.copy(d0).applyAxisAngle(FAN.up, a).normalize();
    FAN.rightD.copy(d0).applyAxisAngle(FAN.up, -a).normalize();
    FAN.center.copy(d0); // out of the lookAt-clobbered scratch BEFORE the first spawn
    spawnBolt(1, false, FAN.left);
    spawnBolt(1, false, FAN.center);
    spawnBolt(1, false, FAN.rightD);
    C.fired.stream += 3;
  } else {
    spawnBolt(1, false);
    C.fired.stream++;
  }
  sweep({ f0: 1500, f1: 320, dur: 0.09, vol: 0.12, type: 'square' }); // shipped stream voice — one per SHOT (a fan is one shot)
}

export function fireTick(dt) {
  const input = C.api.input;
  const wantFire = input.fire;
  C.fireT -= dt;
  // pause cancel (GDD §3.2): the raw key set is the pause signal — the same grammar steer's
  // key reads use, zero cross-module change (input.js stays zero-diff). The loop halts
  // tickCombat while paused, so the FIRST post-unpause tick still sees the key here and zeroes
  // the hold accumulator — a post-unpause release fires a tap's worth of stream, never a
  // charged bolt.
  if (wantFire && !C.dead && (input.keys.has('KeyP') || input.keys.has('Escape'))) {
    C.chargeT = 0; C.charging = false;
  }
  if (!wantFire || C.dead) {
    // release AT/after the threshold → exactly ONE charged bolt, latency ≤ 1 frame (the
    // pointerup flips input.fire at window level; fireTick observes it next tick). Death:
    // accumulator zeroed and the release fires NOTHING (GDD §3.2 cancel rules).
    if (C.charging && !C.dead) {
      spawnBolt(CHARGE_DAMAGE, true);
      C.fired.charged++;
      chargeRelease(); // the heavy thump (GDD §3.2 audio row)
    }
    C.chargeT = 0; C.charging = false;
    return;
  }
  C.chargeT += dt;
  if (C.chargeT >= T_CHARGE) {
    if (!C.charging) { C.charging = true; chargeWhine(); } // the crossing — the whine teaches it (GDD §3.1)
    if (SUPPRESS_STREAM) return;
  }
  if (C.fireT > 0) return;
  C.fireT = C.effects.OVERDRIVE > 0 ? FIRE_INTERVAL / OVERDRIVE_DIV : FIRE_INTERVAL; // OVERDRIVE: stream interval ÷ 2.2 ≈ 0.0568 s — T_CHARGE itself is unchanged (GDD §3.2)
  spawnStreamShot();
}

export function boltsTick(dt) {
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
        if (ENEMIES.hitDrone(d, b.userData.dmg || 1)) { // story-018: the bolt carries its damage (stream 1, charged 6); probe-spawned unstamped bolts default to 1
          C.score += d.userData.kind === 'gunner' ? SCORE_GUNNER : SCORE_DRONE;
          C.kills++;
          dropAt(d.position); // story-018: raider drop site — bolt kills roll 18%, ram deaths never do (enemies.js untouched)
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
        if (DRONES.hitOrb(o, b.userData.dmg || 1)) { // story-018: bolt-carried damage (charged 6 one-shots the 2-HP orb — GDD §5, no special case)
          C.score += SCORE_ORB;
          C.kills++;
          dropAt(o.position); // story-018: orb drop site (the position is clamped inside dropAt — orbs die outside the sphere legally)
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
        if (BOSS.hitBoss(b.userData.dmg || 1, zone === 2, C.bossApi)) EFFECTS.shake(0.12); // story-018: bolt-carried damage — hitBoss already takes the dmg param, boss.js stays zero-diff (weak point 6×3 = 18)
      }
    }
  });
}

// story-018 drop position: the dying enemy's position clamped to r3 ≤ R_HARD − 1 — orbs can
// legally die outside the sphere (orbit overshoot, full-3d-flight §5.4) and an unclamped drop
// behind the hard clamp would be permanently unreachable (GDD §3.3/§5). Uses C.tmp2 — safe:
// the kill sites are synchronous and maybeDrop copies the position. The ONLY two callers are
// the raider/orb bolt-kill sites in boltsTick ("on kill" = player-killed — ram/dive deaths
// self-kill inside enemies.js/drone.js and never roll; the boss path has no call site at all).
function dropAt(pos) {
  C.tmp2.set(pos.x, pos.y - ARENA_Y, pos.z);
  const r3 = C.tmp2.length();
  if (r3 > R_HARD - 1) C.tmp2.multiplyScalar((R_HARD - 1) / r3);
  C.tmp2.y += ARENA_Y;
  POWERUPS.maybeDrop(C.tmp2);
}

/* ---------- damage / death ---------- */
// story-018 effect side (architecture §7.2): the timers' STATE lives on the combat player
// object (combat.js's C — the story pins it); the apply/expire CODE lives here since the
// review-fix split. applyEffect is the api.picked target powerups.js calls back through: set
// the timer to EFFECT_T (same-kind re-pickup REFRESHES to 8 s — never stacks), SHIELD
// additionally refills to SHIELD_MAX. Different kinds run concurrently (one timer each).
// Expiry restores the shipped constants with no snap (the regen delay reads 3 again, the
// stream interval FIRE_INTERVAL again) — the expire blip rides the HUD/audio commit.
export function applyEffect(kind) {
  C.effects[kind] = EFFECT_T;
  if (kind === 'SHIELD') C.shield = SHIELD_MAX;
  pickupBlip(); // the pickup confirm — powerups.js stays sound-free; the api.picked target plays it (architecture §7.2)
}

// story-018 effect timers — ticked on the combat dt (slow-mo slows effects like every
// combat timer); expiry zeroes the timer and restores the shipped constants with no snap.
// (Moved verbatim from tickCombat's inline loop — review-fix split; the call site keeps the
// same position in the tick order: after the shield-regen block, before the pose/cam write.)
export function effectsTick(dt) {
  for (let i = 0; i < EFFECT_KINDS.length; i++) {
    const k = EFFECT_KINDS[i];
    if (C.effects[k] > 0) {
      C.effects[k] -= dt;
      if (C.effects[k] <= 0) { C.effects[k] = 0; expireBlip(); } // the "over" blip marks the boundary — the shipped constants are already restored by the zero
    }
  }
}
