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
import { beep, chargeWhine, chargeRelease, expireBlip, sfxLaser, sfxExplosion, sfxPickup } from './audio.js'; // story-018: named synth recipes (audio.js) — the fire path owns the crossing/release voices, the effect side owns the pickup/expire blips; powerups.js stays sound-free. stage-6 A1a: the laser/explosion/pickup one-liners play the CC0 sample when decoded with the shipped synth params as the CONSOLE-SILENT fallback (audio-audit wiring map)
import * as AIM from './aim-assist.js'; // story 7.4: camera-true aim — weapons consumes aimDir (the spawnBolt/spawnStreamShot base), getLockTarget (the homing-target stamp), targetAlive/leadPoint/AIMK.HOMING_RATE (boltsTick homing); biasDir is retired/uncalled (aim-assist imports enemies/drone/store, never combat.js — dep-check acyclic)

/* ---------- the seam (see the header) ---------- */
let C = null; // combat.js's live state bag — set once by initWeapons, read at CALL TIME
let forward = null; // combat.js's 3D forward closure (story-015 keystone) — live, never copied
let noseWorld = null; // combat.js's nose closure — live, never copied
let ARENA_Y = 0, R_HARD = 0, SHIELD_MAX = 0; // const primitives in combat.js — immutable, snapshot-safe
let KILL_MARK_S = 0; // stage-6 H1: the kill-marker window (s) — combat.js owns the const + the #hit-mark writer; the kill sites below only STAMP the timestamp (additive UI hooks, not logic changes)

export function initWeapons(deps) {
  C = deps.C;
  forward = deps.forward;
  noseWorld = deps.noseWorld;
  ARENA_Y = deps.ARENA_Y;
  R_HARD = deps.R_HARD;
  SHIELD_MAX = deps.SHIELD_MAX;
  KILL_MARK_S = deps.KILL_MARK_S || 0; // stage-6 H1: rides the same seam (the const's single definition lives in combat.js)
}

const FIRE_INTERVAL = 1 / 8; // ~8/s hold-fire
const BOLT_SPEED = 70; // story 7.4: 42 → 70 — camera-true aim + homing need the bolt to reach the converge/lead point inside the life window
export const BOLT_LIFE = 1.1; // story 7.4: 1.2 → 1.1 (range 77u at 70 u/s vs the old 50u — exported — combat.js's scriptedKill path + probeEnv still read it (review-fix split))
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
  // story 7.4: bolts aim at what the CAMERA sees — stream bolts steer at the locked target's
  // lead point (AIM.aimDir), charged bolts stay manual but camera-true (the AIMK.CONVERGE_DIST
  // point). The old nose-forward aim + the spawn bias (AIM.biasDir — retired, still exported
  // uncalled) are gone: a locked bolt converges by AIMING at the target, and boltsTick HOMES
  // stream bolts from here on. aimDir writes the module's OWN scratch — never C.tmp (the
  // clobber warning below still applies to the lookAt itself). Runs BEFORE the lookAt so the
  // mesh follows the aimed dir.
  if (dir) b.userData.dir.copy(dir); else AIM.aimDir(b.position, charged, BOLT_SPEED, b.userData.dir);
  b.userData.target = charged ? null : AIM.getLockTarget(); // story 7.4: the homing target — boltsTick steers stream bolts at its lead point; charged never homes
  b.userData.life = BOLT_LIFE;
  b.userData.dmg = dmg;
  b.userData.charged = charged;
  b.lookAt(C.tmp.copy(b.position).add(b.userData.dir));
  b.scale.setScalar(charged ? CHARGE_SCALE : 1);
  b.material.color.setHex(charged ? CHARGE_COLOR : BOLT_COLOR);
  return b;
}

// story-018 fan scratch (module-level — no per-shot allocation). story 7.4: the fan's BASE is
// the CAMERA-TRUE aim (AIM.aimDir — the locked target's lead point or the AIMK.CONVERGE_DIST
// point), not the ship's nose; the ±SPREAD_ARC rotation keeps the existing axis derivation
// (right = base × WORLD_UP, up = right × base — kept perpendicular to the base, so the angle
// between the dirs is exactly ±6° at any pitch) applied to that base. The charged bolt is
// NEVER fanned (GDD §3.2: 3×6 = 18 alpha per cycle would break the DPS parity anchor). NOTE:
// FAN.center is the aimDir OUT vector (never C.tmp), so spawnBolt's lookAt clobber no longer
// threatens the base — each spawnBolt copies its dir before any lookAt anyway.
const FAN = { right: new THREE.Vector3(), up: new THREE.Vector3(), left: new THREE.Vector3(), rightD: new THREE.Vector3(), center: new THREE.Vector3(), nose: new THREE.Vector3() };
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function spawnStreamShot() {
  noseWorld(FAN.nose);
  AIM.aimDir(FAN.nose, false, BOLT_SPEED, FAN.center); // camera-true base (locked → lead point; else the converge point)
  if (C.effects.SPREAD > 0) {
    FAN.right.copy(FAN.center).cross(WORLD_UP).normalize();
    FAN.up.copy(FAN.right).cross(FAN.center).normalize();
    const a = SPREAD_ARC * Math.PI / 180;
    FAN.left.copy(FAN.center).applyAxisAngle(FAN.up, a).normalize();
    FAN.rightD.copy(FAN.center).applyAxisAngle(FAN.up, -a).normalize();
    spawnBolt(1, false, FAN.left);
    spawnBolt(1, false, FAN.center);
    spawnBolt(1, false, FAN.rightD);
    C.fired.stream += 3;
    C.telemetry.shots.stream += 3; // story-019: each fan bolt counts as a shot (GDD §3.7)
  } else {
    spawnBolt(1, false);
    C.fired.stream++;
    C.telemetry.shots.stream++;
  }
  sfxLaser(); // stage-6 A1a: laser sample when decoded; the shipped stream voice (one per SHOT — a fan is one shot) is the synth fallback
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
      C.telemetry.shots.charged++; // story-019: one charged shot per completed hold
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

// story 7.4 homing + swept-scan scratch (module-level — no per-frame allocation)
const _prev = new THREE.Vector3(), _hp = new THREE.Vector3(), _hd = new THREE.Vector3(),
  _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _cl = new THREE.Vector3();

// story 7.4: swept segment × sphere — a 70 u/s bolt moves 1.2-2.3 u per tick, and the old
// fixed point-sample (distance² < 1.1 at the bolt's NEW position only) could tunnel past a
// small target between samples at headless frame times. a→b is the bolt's per-tick segment;
// c/r the target sphere. Returns true when the segment passes within r of c.
function segHitsSphere(a, b, c, r) {
  _ab.copy(b).sub(a);
  const t = THREE.MathUtils.clamp(_ac.copy(c).sub(a).dot(_ab) / (_ab.lengthSq() || 1), 0, 1);
  return _cl.copy(a).addScaledVector(_ab, t).distanceToSquared(c) < r * r;
}

export function boltsTick(dt) {
  C.bolts.update(dt, (b) => {
    b.userData.life -= dt;
    _prev.copy(b.position); // story 7.4: pre-move position — the swept hit test below spans [prev, now]
    const tg = b.userData.target; // story 7.4 homing — stream bolts steer at the locked target's lead point (charged bolts carry null: never home)
    if (tg && AIM.targetAlive(tg)) {
      AIM.leadPoint(tg, b.position, BOLT_SPEED, _hp);
      _hd.copy(_hp).sub(b.position).normalize();
      if (b.userData.dir.dot(_hd) < 0) b.userData.target = null; // passed it: stop homing
      else {
        b.userData.dir.lerp(_hd, 1 - Math.exp(-AIM.AIMK.HOMING_RATE * dt)).normalize();
        b.lookAt(C.tmp.copy(b.position).add(b.userData.dir));
      }
    }
    b.position.addScaledVector(b.userData.dir, BOLT_SPEED * dt);
    if (b.userData.life <= 0) { C.bolts.kill(b); return; }
    // bolt × drone scan (both pools are small — brute force is the honest option)
    ENEMIES.eachAlive((d) => {
      if (!b.userData.alive) return;
      // story 7.4: swept segment test with the stamped radius — RADIUS_PROP = userData.r
      // (enemies.js: the elite stamp and the unconditional per-spawn reset both write it).
      // The 1.1 floor keeps the old fixed kill-sphere (r ≈ 1.05) as the minimum; ×1.6 is the
      // plan's band. Orbs carry their ORBIT radius in userData.r too — never read here; the
      // orb scan below uses its own bolt radius.
      const r = Math.max(d.userData.r || 0, 1.1) * 1.6;
      if (segHitsSphere(_prev, b.position, d.position, r)) {
        C.bolts.kill(b);
        C.telemetry.hits[b.userData.charged ? 'charged' : 'stream']++; // story-019: bolts die on hit — 1:1 max (probe-spawned unstamped bolts read stream)
        EFFECTS.explosion(d.position);
        sfxExplosion(d.position); // stage-6 A1a: kill boom — sample ×2 round-robin, the shipped noiseBurst params as fallback
        if (ENEMIES.hitDrone(d, b.userData.dmg || 1)) { // story-018: the bolt carries its damage (stream 1, charged 6); probe-spawned unstamped bolts default to 1
          const pts = (d.userData.kind === 'gunner' ? SCORE_GUNNER : SCORE_DRONE) *
            (d.userData.elite ? ENEMIES.ELITE_SCORE_MULT : 1); // story-019: elites pay ×2 when SHOT DOWN (the ×2 never applies to a ram — the ram is the failure state); ELITE_SCORE_MULT rides the existing enemies.js import — no new edge
          C.score += pts;
          C.kills++;
          // story-019: kills by kind — elite kills also count in their kind bucket (elite is a
          // flag, not a kind). The `!== undefined` guards match damagePlayer's damageTaken
          // defense (quality review 2026-11-07): a future enemy kind must degrade to an
          // un-bucketed kill, never NaN the kill path.
          const kind = d.userData.kind;
          if (C.telemetry.kills[kind] !== undefined) C.telemetry.kills[kind]++;
          if (d.userData.elite && C.telemetry.eliteKills[kind] !== undefined) C.telemetry.eliteKills[kind]++;
          if (b.userData.charged) C.telemetry.chargedKills++; // the skill signal
          if (C.telemetry.scoreBy[kind] !== undefined) C.telemetry.scoreBy[kind] += pts;
          C.killMarkLeft = KILL_MARK_S; // stage-6 H1: kill-only hit marker — the REGISTERED-kill stamp (raider/gunner bolt kills); the #hit-mark writer in combat.js owns element + countdown
          dropAt(d.position); // story-018: raider drop site — bolt kills roll 18%, ram deaths never do (enemies.js untouched)
          EFFECTS.shake(0.06); // kill feedback (J)
          beep({ freq: 620, dur: 0.09, vol: 0.16, type: 'triangle' });
        }
      }
    });
    // bolt × orb scan (story-012) — story 7.4: the same swept segment test, the orb's radius
    // VALUE unchanged (orbBoltR2 = 1.3², drone.js; sqrt reads the radius the old point-test
    // compared against). Orbs fly altitudes — full-3D by construction in the swept form.
    DRONES.eachAlive((o) => {
      if (!b.userData.alive) return;
      if (segHitsSphere(_prev, b.position, o.position, Math.sqrt(DRONES.orbBoltR2()))) {
        C.bolts.kill(b);
        C.telemetry.hits[b.userData.charged ? 'charged' : 'stream']++; // story-019: same 1:1 hit rule
        EFFECTS.explosion(o.position);
        sfxExplosion(o.position); // stage-6 A1a: orb-kill boom — same sample family, spatialized from the orb
        if (DRONES.hitOrb(o, b.userData.dmg || 1)) { // story-018: bolt-carried damage (charged 6 one-shots the 2-HP orb — GDD §5, no special case)
          C.score += SCORE_ORB;
          C.kills++;
          C.telemetry.kills.orb++; // story-019: orbs are excluded from elites (GDD §9 Decision 2) — the orb bucket never splits
          if (b.userData.charged) C.telemetry.chargedKills++;
          C.telemetry.scoreBy.orb += SCORE_ORB;
          C.killMarkLeft = KILL_MARK_S; // stage-6 H1: kill-only hit marker — the orb's registered-kill stamp (same hook as the raider site)
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
        C.telemetry.hits[b.userData.charged ? 'charged' : 'stream']++; // story-019: boss hits count too (the kill itself has no score/kills side-effects — story-014 owns the victory rewards)
        EFFECTS.explosion(b.position);
        sfxExplosion(b.position, { heavy: zone === 2 }); // stage-6 A1a: boss-hit boom — the heavy variant keeps the shipped node-hit params as fallback
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
  sfxPickup(); // stage-6 A1a: pickup sample when decoded; the shipped pickupBlip confirm stays as the fallback — powerups.js stays sound-free; the api.picked target plays it (architecture §7.2)
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
