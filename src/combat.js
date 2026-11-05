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
import * as POWERUPS from './powerups.js'; // story-018: drop roll + pickup pool + stats (entity side only — the EFFECT timers live here; powerups never reads combat state, dep-check acyclic)
import { EFFECT_T, KINDS as EFFECT_KINDS } from './powerups.js';
import { beep, sweep, noiseBurst, loopStart, musicEvict, musicSetDuck, alarmTick, proximityTick,
  chargeWhine, chargeRelease, pickupBlip, expireBlip } from './audio.js'; // story-018: named synth recipes (audio.js) — combat owns the call sites; powerups.js stays sound-free
import { stageShip, combatFlow } from './launch.js';
import { droneProbeTick, bossProbeTick, pitchProbeTick, dressingProbeTick, chargeProbeTick, powerupProbeTick, resetProbes } from './probes.js'; // rider R-e: the probe drives + their state live in probes.js — combat calls them, never the reverse (dep-check: acyclic)
import * as DRESSING from './arena-dressing.js'; // story-017: combat-only ambient field + shell visual (GDD §3.6)

const ARENA_Y = 18; // story-016: re-anchored as the sphere CENTER's y — O = (0, ARENA_Y, 0) (the spawn point)
// Sector boundary (story-005 rim → story-016 SPHERE): a soft spherical arena centered on the
// spawn point. Inside R_SOFT flight is untouched; from R_SOFT to R_HARD the outward radial speed
// (along the 3D normal) bleeds toward zero (tangential preserved — the ship slides along the
// shell instead of pinning), past R_HARD the position is scaled back onto the shell, and the rim
// renders as the visible equator ground ring (its opacity driver reads 3D proximity). The floor
// of 3 u/s is load-bearing (story-005: the pure linear cap is asymptotic and reads as mud).
// R_SOFT/R_HARD keep their story-005 VALUES; their meaning widens from disc radius to sphere
// radius, so crossing times and the spawn-ring math are unchanged. Raiders spawn 55 off the
// player, so R_HARD 80 keeps the spawn ring off-camera. The 015 altitude-band scaffold
// (BAND_H/BAND_HH consts, band bleed block, band #warn branch) was RETIRED here — story-016
// replaces it with this sphere (documented in the story record and the harness comment; never
// a quiet edit).
const R_SOFT = 60, R_HARD = 80;
// story-017 (full-3d-flight GDD §3.6/§7): combat-only ambient dressing — the world reads as
// a volume. Knobs live HERE (the owning-module convention): ambient field count (range 80-200)
// + the fixed PRNG seed (deterministic — probe asserts stable), and the boundary-shell max
// opacity (range 0.1-0.3; R8: ≤ the 0.85 bloom threshold, additive/non-emissive).
const AMBIENT_FIELD_COUNT = 120;
const AMBIENT_FIELD_SEED = 17017;
const SHELL_VISUAL_MAX_OPACITY = 0.18;
const MAX_SPEED = 17;        // bumped with the arena — same crossing time as the old 26 arena at 14
const BOOST_MULT = 1.9;
const TURN_RATE = 2.2;       // commanded yaw (rad/s) — full circle ≈ 3 s (story-004: heading is player-owned)
const ACCEL = 14;            // W: u/s² toward the cruise/boost ceiling
const BRAKE = 22;            // S: u/s² down to 0 — brakes harder than W accelerates, and S wins over W
// story-015 (full-3d-flight GDD §3.1-§3.2): pitch + drift. Pitch mirrors the yaw grammar
// exactly (deadzone 0.08, 1.25× combined clamp) inside a ±72° envelope — no loops, ever
// (GDD §5.1: changing that is a design-level reopen, not a tuning knob). Drift makes vel a
// PERSISTENT state realigning toward the nose (§3.2). The 015 BAND_H/BAND_HH altitude-band
// consts lived here as a scaffold and were retired by story-016 (the sphere is the volume).
const PITCH_RATE = 1.8;      // rad/s commanded pitch — slightly slower than yaw: pitch is posture, yaw is aiming
const PITCH_MAX = 1.2566;    // 72° — up-vector safety envelope (camera lateral basis ≥ 0.31 at max pitch)
const PITCH_DEADZONE = 0.08; // NDC — mirrors the yaw deadzone exactly
const PITCH_INVERT = false;  // flips the POINTER convention ONLY (keys unaffected) — playtest escape hatch
const ALIGN_RATE = 4.5;      // 1/s — drift realignment toward forward·speed (slip ≈ 25° at full turn)
const FIRE_INTERVAL = 1 / 8; // ~8/s hold-fire
const BOLT_SPEED = 42;
const BOLT_LIFE = 1.2;
// story-018 rider (orchestrator-accepted): 24 → 36 — SPREAD+OVERDRIVE saturation headroom
// (GDD §3.8: 17.6 shots/s × 3 fan bolts × 1.2 s life at the pathological extreme). Prepare-time
// allocation, restart-clean preserved; pool.js steal-oldest remains the final cap.
const BOLT_POOL = 36;
// story-018 charged shot (GDD §3.1-3.2, §7 — threshold spray-then-charge, the resolved
// Decision 1): ONE trigger, two stages. Below T_CHARGE of continuous LMB hold the stream fires
// exactly as shipped (first bolt on the press frame); AT the threshold the stream suppresses
// and the charge fills; release at/after the threshold fires exactly ONE charged bolt; release
// before it fires nothing extra (the stream already did the work — no partial charge).
const T_CHARGE = 0.6;          // s of continuous hold before suppression + charge fill (feel knob 0.45-0.9)
const CHARGE_DAMAGE = 6;       // charged bolt damage — elite-gunner one-shot anchor; boss weak point 6×3 = 18 (curve knob 4-8)
const CHARGE_SCALE = 3.0;      // charged bolt visual scale ×3 — readable under the shipped bloom chain
const SUPPRESS_STREAM = true;  // DESIGN CONST, not a knob: the balance hinge (GDD §3.1) — stream+charge together is a dominant strategy
const BOLT_COLOR = 0x9fe8ff;   // shipped stream bolt color
const CHARGE_COLOR = 0xffc85a; // charged bolt — the amber family (the boss node's color language, GDD §3.2)
// story-018 effect knobs (GDD §7 places SPREAD_ANGLE/OVERDRIVE_DIV in combat.js — the consumer; EFFECT_T lives in powerups.js with the other pickup consts)
const SPREAD_ARC = 6;          // degrees — ±6° three-bolt fan per stream shot while SPREAD is active
const OVERDRIVE_DIV = 2.2;     // stream interval ÷ 2.2 while OVERDRIVE is active — T_CHARGE unchanged (GDD §3.2)
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
  chargeT: 0, charging: false, // story-018: hold accumulator (s) + past-threshold latch — zeroed on death/pause/exit (GDD §3.2 cancel rules)
  effects: { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 }, // story-018: seconds remaining per pickup effect — OWNER: combat.js (architecture §7.2; the entity side lives in powerups.js)
  fired: { stream: 0, charged: 0 }, // story-018 probe surface: fire-path bolts spawned this fight (story-019's telemetry supersedes)
  wave: 0, waveGapT: 0, score: 0, kills: 0,
  time: 0, // story-014: per-fight combat clock — scaled sdt while alive (the world's slow-mo slows it), frozen while dead; reset each enterCombat. NOT game.time (the global clock — launch phases own it)

  bed: null, scriptT: -1, scriptDone: false,
  bossApi: null, // the boss's tick/death api (built in prepareCombat; boss.js stays a pure signal source)
  // probe state for the three probe drives (drone/boss/pitch) moved to src/probes.js (rider R-e)
  tmp: new THREE.Vector3(), tmp2: new THREE.Vector3(),
  ndc: new THREE.Vector3(), // hoisted unproject scratch (feel: no per-frame allocation)
  flow: 0, // smoothed boost → field-flow factor (0 idle drift, 1 rush)
  proxScanT: 0, nearest: null, // story-009: nearest-hostile scan gate (≤ every 0.15 s) + last result (spec §5)
  rim: null, // story-005: the visible sector-edge ring (created once, opacity driven by proximity)
  pips: [], pipDir: new THREE.Vector3(), pipFwd: new THREE.Vector3(), pipInv: new THREE.Quaternion(),
  retX: -1, retY: -1, lastBars: null, lastScore: null, // change-gates for DOM writes
  lastChips: null, lastChargePct: -1, lastChargeFull: null, // story-018: chip line + charge-meter change-gates
};
const qs = new URLSearchParams(location.search);
const SCRIPTED_KILL = qs.get('scriptedKill') === '1';
// the probe query flags (/droneProbe, ?bossProbe, ?bossShot, ?pitchProbe) moved to src/probes.js (rider R-e)

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
  DRESSING.prepareDressing(scene, { AMBIENT_FIELD_COUNT, AMBIENT_FIELD_SEED, SHELL_VISUAL_MAX_OPACITY, R_SOFT, R_HARD, ARENA_Y }); // story-017: baseline member — the ambient field + shell visual are created ONCE here (never per-entry allocation) and hide/show with the combat lifecycle
  POWERUPS.preparePowerups(scene); // story-018: the pickup pool joins the entity baseline — created ONCE, pre-warmed 6 (restarts allocate nothing new; the restartProbe baseline RISES by 6, recorded)
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

function forward(out) {
  // story-015 keystone (GDD §3.0): the 3D form. Every consumer — ship velocity, player
  // bolts, chase cam, probe spawns — gains the vertical component correctly from this ONE
  // change. φ = pitch, nose-up positive.
  const cp = Math.cos(C.pitch);
  return out.set(Math.sin(C.heading) * cp, Math.sin(C.pitch), Math.cos(C.heading) * cp);
}

/* rider R-e: the pure helpers + constants handed to src/probes.js (the probe drives may not
 * import combat.js — house dep-check). Same values the ticks closed over before the extraction. */
const probeEnv = { forward, noseWorld, clamp, ARENA_Y, BOLT_LIFE, TURN_RATE, HP_MAX, SHIELD_MAX };

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

  // soft spherical arena (story-016, GDD §3.5/§4.4): past R_SOFT the outward radial component
  // (along the 3D normal n = (pos − O)/r3) bleeds toward zero — story-005's formula with the
  // 3D normal; tangential preserved (the ship slides along the shell instead of pinning against
  // a wall). Floor 3 is story-005's bounded-arrival finding carried into 3D unchanged: the pure
  // linear cap is asymptotic (dr/dt ∝ (R_HARD−r3)) and reads as mud at the shell.
  let r3 = Math.hypot(C.pos.x, C.pos.y - ARENA_Y, C.pos.z);
  if (r3 > R_SOFT) {
    const nx = C.pos.x / r3, ny = (C.pos.y - ARENA_Y) / r3, nz = C.pos.z / r3; // outward unit normal
    const radial = C.vel.x * nx + C.vel.y * ny + C.vel.z * nz;
    const cap = Math.max(3, MAX_SPEED * (R_HARD - r3) / (R_HARD - R_SOFT));
    if (radial > cap) {
      const excess = radial - cap;
      C.vel.x -= excess * nx; C.vel.y -= excess * ny; C.vel.z -= excess * nz;
    }
  }
  C.pos.addScaledVector(C.vel, dt);

  // hard spherical clamp — safety net for the one frame the bleed cap allows: past R_HARD the
  // position is scaled back onto the shell (pos = O + (pos − O)·R_HARD/r3, GDD §4.4)
  r3 = Math.hypot(C.pos.x, C.pos.y - ARENA_Y, C.pos.z);
  if (r3 > R_HARD) {
    const s = R_HARD / r3;
    C.pos.x *= s;
    C.pos.y = ARENA_Y + (C.pos.y - ARENA_Y) * s;
    C.pos.z *= s;
    r3 = R_HARD;
  }
  // #warn ("EDGE OF SECTOR") fires entering the soft shell (r3 > 60) and clears inside it —
  // the 015 band branch of this driver was retired with the band scaffold (story-016).
  if (C.ui.warn) {
    C.ui.warn.hidden = (r3 <= R_SOFT) || C.dead;
    C.ui.warn.textContent = 'EDGE OF SECTOR';
  }
  // rim ring opacity: 3D proximity (was 2D hypot(x,z) — story-016; the ring stays at the
  // equator as the ground reference, no shell visual until story-017)
  if (C.rim) C.rim.material.opacity = clamp((r3 - R_SOFT) / (R_HARD - R_SOFT), 0, 1) * 0.55;

  // bank reads the commanded turn — same visual sign as the old left-turn lean (right turn +)
  C.bank += (clamp(-turn * 0.7, -0.7, 0.7) - C.bank) * (1 - Math.exp(-7 * dt));
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

function fireTick(dt) {
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

/* ---------- damage / death ---------- */
// story-018 effect side (architecture §7.2): the timers live HERE on the combat player object.
// applyEffect is the api.picked target powerups.js calls back through: set the timer to
// EFFECT_T (same-kind re-pickup REFRESHES to 8 s — never stacks), SHIELD additionally refills
// to SHIELD_MAX. Different kinds run concurrently (one timer each). Expiry restores the
// shipped constants with no snap (the regen delay reads 3 again, the stream interval
// FIRE_INTERVAL again) — the expire blip rides the HUD/audio commit.
function applyEffect(kind) {
  C.effects[kind] = EFFECT_T;
  if (kind === 'SHIELD') C.shield = SHIELD_MAX;
  pickupBlip(); // the pickup confirm — powerups.js stays sound-free; the api.picked target plays it (architecture §7.2)
}
const POWERUP_API = { picked: applyEffect }; // composed ONCE — powerups.js never reads combat state (acyclic)

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

/* ---------- probe drives (story-012/013/015) → src/probes.js ----------
 * R-e extraction (story-016): droneProbeTick / bossProbeTick / pitchProbeTick + their probe
 * state + the ?droneProbe/?bossProbe/?bossShot/?pitchProbe query-flag wiring moved VERBATIM
 * to src/probes.js. combat.js calls them with (dt, C, probeEnv) — probes never import combat.js
 * (house dep-check: acyclic). Behavior-neutral: the same code, the same context. */


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
  DRESSING.showDressing(); // story-017: the ambient field + shell visual join the fight (rim-ring lifecycle)
  C.pos.set(0, ARENA_Y, 0);
  C.vel.set(0, 0, 0);
  C.heading = 0; C.bank = 0; C.speed = 0; C.pitch = 0; // story-015: the replay never inherits a nose-up start (GDD §5.6); vel reset above covers drift
  C.hp = HP_MAX; C.shield = SHIELD_MAX; C.regenT = 0; C.dead = false; C.deathT = 0;
  C.fireT = 0; C.boost = 1; C.boosting = false;
  C.chargeT = 0; C.charging = false; // story-018: the hold accumulator never survives an entry (GDD §3.2 combat-exit cancel)
  C.effects = { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 }; // story-018: effect timers wipe beside score/kills (the L453 pattern)
  C.fired = { stream: 0, charged: 0 }; // story-018 probe counters restart beside kills (the L453 pattern)
  C.score = 0; C.kills = 0; C.wave = 1; C.waveGapT = 0;
  C.time = 0; // story-014: the clock is per-fight — every combat entry restarts it
  C.scriptT = -1; C.scriptDone = false; C.scriptDrone = null;
  C.victoryFired = false; // stage-2 review (finding 3): the flag is per-fight — a fresh combat grants waves again
  // story-013: the boss's single entity drains with the pools (§8.6); the probe states (drone/
  // boss/pitch) live in src/probes.js and restart via resetProbes() — rider R-e extraction
  BOSS.clearBoss();
  resetProbes();
  window.__stage2.bossDefeatedReports = 0; // review (finding 1): the exactly-once counter is per-fight
  C.flow = 0;
  C.proxScanT = 0; C.nearest = null; // story-009: proximity scan restarts clean (§8.6)
  C.lastBars = null; C.lastScore = null; // clearCombat emptied the DOM — force one HUD rewrite
  C.lastChips = null; C.lastChargePct = -1; C.lastChargeFull = null; // story-018: same rewrite force for the chips + charge meter
  C.bolts.clear();
  POWERUPS.clearPowerups(); // story-018: the pickup pool drains with the pools — enterCombat needs no re-show (pickups are hidden until dropped, like bolts)
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
  POWERUPS.tickPowerups(dt, C.pos, POWERUP_API); // story-018: age/spin/blink/despawn + the full-3D pickup check → api.picked
  scriptedKillTick(dt);
  droneProbeTick(dt, C, probeEnv); // rider R-e: probes receive combat state + pure helpers (probes.js never imports combat.js)
  bossProbeTick(dt, C, probeEnv);
  pitchProbeTick(dt, C, probeEnv); // story-015: deterministic pitch+drift walk (?pitchProbe=1)
  dressingProbeTick(dt, C, probeEnv); // story-017: deterministic dressing walk (?dressingProbe=1)
  chargeProbeTick(dt, C, probeEnv); // story-018: deterministic charged-shot walk (?chargeProbe=1)
  powerupProbeTick(dt, C, probeEnv); // story-018: deterministic pickup/effect walk (?powerupProbe=1)
  DRESSING.tickDressing(dt, Math.hypot(C.pos.x, C.pos.y - ARENA_Y, C.pos.z)); // story-017: slow whole-group rotation + shell opacity from 3D proximity (the ring's driver grammar)

  // shield regen after a clean 3 s — story-018: while SHIELD is active the regen delay reads 0
  // (GDD §3.3's intended reading: a hit still zeroes regenT, and the zero delay means regen
  // resumes immediately in-window; expiry restores the 3 s delay with no snap)
  C.regenT += dt;
  if (C.regenT >= (C.effects.SHIELD > 0 ? 0 : SHIELD_REGEN_DELAY)) C.shield = Math.min(SHIELD_MAX, C.shield + SHIELD_REGEN_RATE * dt);

  // story-018 effect timers — ticked on the combat dt (slow-mo slows effects like every
  // combat timer); expiry zeroes the timer and restores the shipped constants with no snap
  for (let i = 0; i < EFFECT_KINDS.length; i++) {
    const k = EFFECT_KINDS[i];
    if (C.effects[k] > 0) {
      C.effects[k] -= dt;
      if (C.effects[k] <= 0) { C.effects[k] = 0; expireBlip(); } // the "over" blip marks the boundary — the shipped constants are already restored by the zero
    }
  }

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

  // story-018 effect chips — one per active effect, name + whole seconds left, change-gated
  // (the hudBars pattern).combat owns the write; the element + styles live in the template.
  if (C.ui.hudChips) {
    let chips = '';
    for (let i = 0; i < EFFECT_KINDS.length; i++) {
      const k = EFFECT_KINDS[i];
      if (C.effects[k] > 0) chips += `<span class="chip k-${k}">${k} ${Math.ceil(C.effects[k])}s</span>`;
    }
    if (chips !== C.lastChips) { C.ui.hudChips.innerHTML = chips; C.lastChips = chips; }
  }

  // story-018 charge meter — the reticle ring fills 0→1 over T_CHARGE during a hold and
  // flashes at the crossing (.charge-full). Change-gated on the 5%-stepped fill + the
  // crossing state (the reticle is combat's DOM write — it rides the pointer position block).
  if (C.ui.reticle) {
    const pct = Math.round(clamp(C.chargeT / T_CHARGE, 0, 1) * 20) * 5;
    const full = C.charging;
    if (pct !== C.lastChargePct || full !== C.lastChargeFull) {
      C.ui.reticle.style.setProperty('--p', pct);
      C.ui.reticle.classList.toggle('charge', pct > 0);
      C.ui.reticle.classList.toggle('charge-full', full);
      C.lastChargePct = pct; C.lastChargeFull = full;
    }
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
  POWERUPS.clearPowerups(); // story-018: the pickup pool drains with the pools — enterCombat needs no re-show (pickups are hidden until dropped, like bolts)
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
  if (C.ui.hudChips) C.ui.hudChips.innerHTML = ''; // story-018: combat's chip line must not ride the pad (same class as the bars clear)
  if (C.ui.reticle) { // story-018: the charge meter is combat's write — the pad gets a clean reticle
    C.ui.reticle.classList.remove('charge', 'charge-full');
    C.ui.reticle.style.removeProperty('--p');
  }
  C.lastChips = null; C.lastChargePct = -1; C.lastChargeFull = null; // force one rewrite on re-entry
  if (C.ui.tele) C.ui.tele.textContent = ''; // TD-014 (story-013): the SPD line is combat's write —
  // it must not ride the pad until cruise rewrites (phases.js resets its lastSpd gate on combat.enter)
  for (const pip of C.pips) pip.style.opacity = '0'; // story-014 (found during evidence capture): combat's
  // last-frame pip state must not ride the pad — the pips are combat's writes, same class as the #hud-bars
  // clear above (pre-existing leak; the death-card REPLAY inherits this fix too)
  C.dead = false; C.deathT = 0; C.speed = 0;
  C.chargeT = 0; C.charging = false; // story-018: a mid-hold exit wipes the accumulator (GDD §3.2) — the death-card SKIP can never inherit it
  C.effects = { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 }; // story-018: timers + entities wiped with the pools
  C.fired = { stream: 0, charged: 0 };
  if (C.rim) { C.rim.material.opacity = 0; C.rim.visible = false; } // story-005: rim leaves the render list with combat (review R2-9)
  DRESSING.hideDressing(); // story-017: the ambient field + shell visual leave the render list with combat (rim-ring lifecycle — hidden, never disposed)
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
    rimOpacity: C.rim ? +C.rim.material.opacity.toFixed(3) : 0, // story-016: the equator ring's 3D-proximity driver, harness-visible (probe surface only)
    speed: +C.speed.toFixed(2), heading: +C.heading.toFixed(3), // probe surface — flow-check's throttle/turn asserts (story-004)
    pitch: +C.pitch.toFixed(3), velMag: +C.vel.length().toFixed(2), // story-015: pitch envelope + true speed under drift (SPD keeps showing C.speed; velMag is harness-only, §8 decision c)
    charge: +Math.min(1, C.chargeT / T_CHARGE).toFixed(3), // story-018: the charge fill 0..1 over T_CHARGE
    charging: C.charging, // story-018: past the threshold — stream suppressed, release fires the charged bolt
    effects: { SPREAD: +C.effects.SPREAD.toFixed(2), OVERDRIVE: +C.effects.OVERDRIVE.toFixed(2), SHIELD: +C.effects.SHIELD.toFixed(2) }, // story-018: seconds remaining per effect (the EXPOSED surface — GDD names it combatState().effects)
    fired: { stream: C.fired.stream, charged: C.fired.charged }, // story-018 probe surface (pre-telemetry; story-019 supersedes)
    pos: C.pos.toArray().map((v) => +v.toFixed(2)), // probe surface — flow-check's keyboard-motion assert (story-003)
    dead: C.dead,
  };
}
export function probeDamagePlayer(n) { damagePlayer(n); }
export function deathFastForward() { // dying: Enter/Space skip the slow-mo (main routes here; no-op once the card is up)
  if (C.dead) C.deathT = DEATH_SLOWMO;
}
