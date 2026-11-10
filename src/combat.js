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
import * as POWERUPS from './powerups.js'; // story-018: drop roll + pickup pool + stats (entity side only — the EFFECT-timer code lives in weapons.js since the review-fix split; powerups never reads combat state, dep-check acyclic)
import { KINDS as EFFECT_KINDS } from './powerups.js';
import { noiseBurst, loopStart, musicEvict, musicSetDuck, alarmTick, proximityTick, setListener, sfxHit } from './audio.js'; // story-009 audio + hit voices that stayed with combat (the fire-path/effect voices moved to weapons.js with their call sites). stage-6 A1a: setListener feeds the ship position to the panner/attenuation math once per frame; sfxHit is the impact sample for the hurt site below
import { initWeapons, makeBolt, fireTick, boltsTick, effectsTick, applyEffect, T_CHARGE, BOLT_LIFE } from './weapons.js'; // review-fix split (story-018 review round): the fire path + projectile/effect side — verbatim moves; combat calls them at the same tickCombat positions and composes POWERUP_API around the imported applyEffect
import { stageShip, combatFlow, setLaneVisible } from './launch.js';
import * as AIM from './aim-assist.js'; // stage-6 W1: the lock scan + spawn-bias + aim HUD owner — combat hands the LIVE C + forward closure ONCE (the initWeapons seam pattern); aim-assist imports enemies/drone directly and must NEVER import combat.js (dep-check rule)
import { droneProbeTick, bossProbeTick, pitchProbeTick, dressingProbeTick, chargeProbeTick, powerupProbeTick, balanceProbeTick, fireProbeTick, flightProbeTick, resetProbes } from './probes.js'; // rider R-e: the probe drives + their state live in probes.js — combat calls them, never the reverse (dep-check: acyclic; story-019 adds balanceProbeTick through the same re-export wiring; stage-6 W1 adds fireProbeTick — the real-fire capture walk; stage-7 story 7.0 adds flightProbeTick — the flight-baseline walk)
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
const AMBIENT_FIELD_COUNT = 40;
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
// story-018 rider (orchestrator-accepted): 24 → 36 — SPREAD+OVERDRIVE saturation headroom
// (GDD §3.8: 17.6 shots/s × 3 fan bolts × 1.2 s life at the pathological extreme). Prepare-time
// allocation, restart-clean preserved; pool.js steal-oldest remains the final cap.
const BOLT_POOL = 36;
const HP_MAX = 100, SHIELD_MAX = 50, SHIELD_REGEN_DELAY = 3, SHIELD_REGEN_RATE = 14;
const DEATH_SLOWMO = 0.7;    // seconds of real time at timeScale 0.3 before gameover (a click lands it sooner)
const SCORE_WAVE = 150; // the wave-clear bonus (the kill-site scores moved to weapons.js with the kill sites — review-fix split)
const SCORE_BOSS = 1000; // story-019: the boss-defeat reward — LOCKED flat (player decision 2026-11-04/05, story-019 L12-13); NOT a tuning knob. Lives beside SCORE_WAVE because the award reads/writes C.score HERE (architecture §8.1): boss.js stays a pure signal source — threading score through the api would extend the surface and boss.js importing combat.js is a cycle.
// stage-6 H1 HUD chrome consts (presentation, not tuning knobs): the wave banner's ~2 s reveal
// window and the kill-only hit marker's ~150 ms life. KILL_MARK_S rides the initWeapons seam
// (weapons.js's kill sites stamp the timestamp — the same live-seam pattern as C itself).
const BANNER_T = 2.0, KILL_MARK_S = 0.15;

// story-019: the balance telemetry accumulator (GDD §3.7 — the stage's namesake). A per-run
// bag of EVENT-DRIVEN counters: incremented only at existing event sites (kill / hit / shot /
// damage / wave-increment / score events), never per-frame, nothing in the render loop.
// Accuracy is DERIVED by the reader (hits/shots) — never stored as a division. Lives ON C so
// the weapons.js seam (the fire path + kill sites since the review-fix split) increments
// through the same live reference with zero new imports. Zeroed in enterCombat beside
// score/kills (the L453 pattern); exposed via combatState().telemetry (probe surface only —
// zero player UI).
function freshTelemetry() {
  return {
    kills: { gunner: 0, rammer: 0, orb: 0 }, // by kind, any bolt
    eliteKills: { gunner: 0, rammer: 0 }, // subset of kills — elite is a flag, not a kind
    chargedKills: 0, // kills by charged bolt — the skill signal
    shots: { stream: 0, charged: 0 }, // bolts spawned (a SPREAD fan counts each fan bolt)
    hits: { stream: 0, charged: 0 }, // bolts that hit anything (1:1 max — bolts die on hit)
    damageTaken: { bolt: 0, ram: 0, dive: 0, bossDash: 0, rock: 0 }, // summed damage by honest source —
    // 'bolt' honestly merges gunner fire AND the boss volley (both ride the E.bolts pool and
    // the same player scan through the enemies api); 'dive'/'bossDash' are tagged by their
    // per-caller api wraps (the orb's / the boss's only damage source each — drone.js and
    // boss.js stay zero-diff)
    deathBy: null, // the killing blow's source (probe-forced deaths pass no source — stays null)
    scoreBy: { gunner: 0, rammer: 0, orb: 0, waveBonus: 0, boss: 0 },
    waveReached: 1,
    waveTimes: [], // combat-clock time at each wave increment (≤ 6 events/run)
    pickups: { dropped: 0, picked: 0, expired: 0, byKind: { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 } }, // read as deltas over powerups.stats() at dump time (the soft dep — fields read 0 if the events never fire)
  };
}

const C = {
  ready: false, scene: null, camera: null, rocket: null, ui: null, api: null,
  pose: null, tilt: null,
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), heading: 0, bank: 0, speed: 0, pitch: 0, // speed = throttle state (u/s along the nose); heading/pitch are player-commanded (story-004/015); vel is drift state (persistent, story-015)
  rockCooldown: 0,
  hp: HP_MAX, shield: SHIELD_MAX, regenT: 0, dead: false, deathT: 0,
  fireT: 0, boost: 1, boosting: false,
  chargeT: 0, charging: false, // story-018: hold accumulator (s) + past-threshold latch — zeroed on death/pause/exit (GDD §3.2 cancel rules)
  effects: { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 }, // story-018: seconds remaining per pickup effect — OWNER: combat.js (architecture §7.2; the entity side lives in powerups.js)
  fired: { stream: 0, charged: 0 }, // story-018 probe surface: fire-path bolts spawned this fight (story-019's telemetry supersedes)
  bossAwarded: false, // story-019: the SCORE_BOSS exactly-once latch (reset in enterCombat beside score/kills)
  telemetry: freshTelemetry(), telemetryPuBase: null, // story-019: the event-driven accumulator + the powerups.stats() baseline its pickup counters delta over
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
  // stage-6 H1 chrome change-gates: boss bar (presence + 5%-stepped fill), wave banner
  // (composed visibility+text signal), kill marker (visibility) — all DOM writes gated on
  // these, the lastBars pattern (hard build constraint 1).
  lastBossShow: null, lastBossPct: -1, bannerT: 0, lastBannerSig: '', killMarkLeft: 0, lastKillMark: false,
};
const qs = new URLSearchParams(location.search);
const SCRIPTED_KILL = qs.get('scriptedKill') === '1';
// the probe query flags (/droneProbe, ?bossProbe, ?bossShot, ?pitchProbe) moved to src/probes.js (rider R-e)

const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a)); // NaN-safe (§8.9)
const fmt = (n) => (Number.isFinite(n) ? String(Math.max(0, Math.floor(n))) : '0'); // honest HUD values (spec #16)

// makeBolt (the bolt factory) moved to weapons.js with the fire path — review-fix split; the
// pool itself is still created HERE in prepareCombat (BOLT_POOL lives with the prepare).

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
    damagePlayer: (n) => damagePlayer(n, 'bossDash'), // story-019: the dash ram is the boss's ONLY damage source — the api wrap tags it (boss.js zero-diff)
    explosion: (p) => EFFECTS.explosion(p), shake: (a) => EFFECTS.shake(a),
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
        // story-019: the locked flat boss reward — awarded BEFORE go('victory') so the card
        // freezes it same-frame (victory.enter reads cs.score inside the go() call stack,
        // phases.js). Its OWN latch, independent of the dead/victory guards: a forced second
        // completion re-enters this branch (the counter stays countable) but the award happens
        // exactly once per fight; enterCombat resets the latch beside score/kills.
        // SPEC-REVIEW ROUND (2026-11-07): scoreBy.boss rides the SAME latch guard — it was a
        // dead field before (the dump-sanity assert checks presence only, so boss:0 passed
        // vacuously on a run whose score included the +1000; the strengthened harness clause
        // pins scoreBy.boss === 1000).
        if (!C.bossAwarded) { C.bossAwarded = true; C.score += SCORE_BOSS; C.telemetry.scoreBy.boss += SCORE_BOSS; }
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

/* rider R-e: the pure helpers + constants handed to src/probes.js (the probe drives may not
 * import combat.js — house dep-check). Same values the ticks closed over before the extraction. */
const probeEnv = { forward, noseWorld, clamp, ARENA_Y, BOLT_LIFE, TURN_RATE, HP_MAX, SHIELD_MAX };

// weapons seam (review-fix split, story-018 review round): the fire path + projectile/effect
// side lives in src/weapons.js. combat hands over the LIVE C reference — every C.* read there
// (C.bolts, C.rocket, C.api, C.bossApi are assigned asynchronously in prepareCombat) stays a
// CALL-TIME read, never a snapshot; forward/noseWorld are live closures over C. ARENA_Y /
// R_HARD / SHIELD_MAX are const primitives — immutable, snapshot-safe by construction. Called
// once at module scope: the references never change for the page's lifetime.
initWeapons({ C, forward, noseWorld, ARENA_Y, R_HARD, SHIELD_MAX, KILL_MARK_S, collideRocks: DRESSING.collideRocks });
// stage-6 W1: the aim-lock seam — the same live-reference contract as initWeapons above
// (call-time reads of C.pos/C.camera/C.api; forward is the live closure). NOT probeEnv — that
// is the probes-only seam; the aim state is game code, not probe plumbing. Called once at
// module scope: the references never change for the page's lifetime. story 7.4: the camera
// rides the seam too — C.camera is assigned asynchronously in prepareCombat, so aim-assist
// lazily binds the live reference on first use (the hudTick precedent: the camera is read
// through the C bag, never snapshotted at init time).
AIM.initAimAssist({ C, forward, camera: C.camera });

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

  // rock collision (story 7.5) — sphere-vs-sphere obstacle deflection + impact damage
  if (C.rockCooldown > 0) C.rockCooldown = Math.max(0, C.rockCooldown - dt);
  const pen = DRESSING.collideRocks(C.pos, 1.4, C.tmp);
  if (pen > 0) {
    C.pos.addScaledVector(C.tmp, pen);
    const vn = C.vel.dot(C.tmp);
    if (vn < 0) C.vel.addScaledVector(C.tmp, -1.6 * vn);
    if (C.rockCooldown <= 0 && !C.dead) {
      const impactSpeed = Math.max(0, -vn);
      const dmg = Math.min(25, Math.max(6, Math.round(impactSpeed * 0.75)));
      C.rockCooldown = 0.35;
      damagePlayer(dmg, 'rock');
    }
  }

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
  // #warn fires entering the soft shell (r3 > 60) and clears inside it (two-stage warning)
  if (C.ui.warn) {
    const show = (r3 > R_SOFT) && !C.dead;
    C.ui.warn.hidden = !show;
    if (show) {
      if (r3 >= 72) {
        C.ui.warn.textContent = 'END OF COMBAT ZONE - TURN BACK';
        C.ui.warn.classList.add('danger');
      } else {
        C.ui.warn.textContent = 'APPROACHING ZONE EDGE';
        C.ui.warn.classList.remove('danger');
      }
    } else {
      C.ui.warn.classList.remove('danger');
    }
  }
  // rim ring opacity: 3D proximity (was 2D hypot(x,z) — story-016; the ring stays at the
  // equator as the ground reference, no shell visual until story-017)
  if (C.rim) C.rim.material.opacity = clamp((r3 - R_SOFT) / (R_HARD - R_SOFT), 0, 1) * 0.55;

  // bank reads the commanded turn — same visual sign as the old left-turn lean (right turn +)
  C.bank += (clamp(-turn * 0.7, -0.7, 0.7) - C.bank) * (1 - Math.exp(-7 * dt));
}

/* ---------- weapons (review-fix split) ----------
 * The fire path + projectile/effect side moved verbatim to src/weapons.js (spawnBolt,
 * spawnStreamShot, fireTick, boltsTick + makeBolt, dropAt, applyEffect + the effect-timer
 * loop). combat.js still CALLS them at the same tickCombat positions (below) and owns the
 * C state they read through the initWeapons seam. T_CHARGE/BOLT_LIFE ride the import back —
 * combatState's charge read and probeEnv still need them. BOLT_POOL stays here: the pool is
 * created in prepareCombat (line-scoped, restart-clean §8.6). */

/* ---------- damage / death ---------- */
// story-018 effect side (architecture §7.2): the timers' STATE stays HERE on the combat player
// object (the story pins it); the apply/expire CODE moved to weapons.js with the fire path
// (review-fix split — applyEffect is imported above). combat still composes the api exactly as
// before, so powerups.js's callback surface is unchanged.
const POWERUP_API = { picked: applyEffect }; // composed ONCE — powerups.js never reads combat state (acyclic)

function damagePlayer(n, source) { // story-019: optional source tag — the four honest sources ('bolt' = gunner fire AND the boss volley, honestly merged: both ride E.bolts through the enemies api call site; 'ram' = raider contact; 'dive' tagged by the DRONES api wrap; 'bossDash' by the bossApi wrap). Probe-forced deaths (probeDamagePlayer) pass no source — they are not gameplay damage and never reach the accumulator.
  if (C.dead) return;
  const toShield = Math.min(C.shield, n);
  C.shield -= toShield;
  const toHull = n - toShield;
  C.hp = Math.max(0, C.hp - toHull);
  C.regenT = 0;
  if (source && C.telemetry.damageTaken[source] !== undefined) C.telemetry.damageTaken[source] += n;
  EFFECTS.hitVeil(260);
  EFFECTS.shake(0.16);
  sfxHit(); // stage-6 A1a: impact sample when decoded; the audit's binding impact recipe (noiseBurst 1800→300 + 200 Hz triangle) is the CONSOLE-SILENT fallback — hurt no longer shares the kill boom's timbre (audio-audit gap 9)
  if (C.hp <= 0) {
    C.dead = true;
    C.deathT = 0;
    if (source && C.telemetry.damageTaken[source] !== undefined) C.telemetry.deathBy = source; // the killing blow's source
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
    if (C.waveGapT <= 0) {
      C.waveGapT = 1.6;
      if (C.wave > 0) { const bonus = SCORE_WAVE * C.wave; C.score += bonus; C.telemetry.scoreBy.waveBonus += bonus; } // story-019: score-by-source at the existing bonus event
    }
    C.waveGapT -= dt;
    if (C.waveGapT <= 0) {
      C.waveGapT = 0; C.wave++;
      C.bannerT = BANNER_T; // stage-6 H1: the wave banner re-arms at the real increment point
      C.telemetry.waveReached = C.wave; C.telemetry.waveTimes.push(+C.time.toFixed(2)); // story-019: the pacing curve — free at the existing increment event (≤ 6 events/run)
      if (C.wave > BOSS_WAVE && BOSS.eligible()) BOSS.spawnBoss(C.pos); // story-013: the warden arrives
      else { ENEMIES.startWave(C.wave, C.pos); DRONES.startWave(C.wave); }
    }
  }
}

/* ---------- scripted kill probe (?scriptedKill=1) ----------
 * Mutation-tested 2026-11-02: seen RED before the fix (bolt dir negated → bolt flew
 * away from the drone; probe read kills 0 / score 150, no lastReport kill), GREEN after
 * (kills 1, score +100, particles 12). It fails loudly when bolts stop killing.
 * stage-6 W1 note: the probe bolt here spawns via C.bolts.spawn DIRECTLY — it bypasses
 * spawnBolt, so the aim-lock spawn bias can never perturb this mutation-pinned probe. */
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
  setLaneVisible(false); // story-7.5: launch lane rocks hide in combat
  C.pos.set(0, ARENA_Y, 0);
  C.vel.set(0, 0, 0);
  C.heading = 0; C.bank = 0; C.speed = 0; C.pitch = 0; // story-015: the replay never inherits a nose-up start (GDD §5.6); vel reset above covers drift
  C.hp = HP_MAX; C.shield = SHIELD_MAX; C.regenT = 0; C.dead = false; C.deathT = 0;
  C.fireT = 0; C.boost = 1; C.boosting = false;
  C.chargeT = 0; C.charging = false; // story-018: the hold accumulator never survives an entry (GDD §3.2 combat-exit cancel)
  C.rockCooldown = 0;
  C.effects = { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 }; // story-018: effect timers wipe beside score/kills (the L453 pattern)
  C.fired = { stream: 0, charged: 0 }; // story-018 probe counters restart beside kills (the L453 pattern)
  C.score = 0; C.kills = 0; C.wave = 1; C.waveGapT = 0;
  C.bossAwarded = false; // story-019: the award latch is per-fight — a fresh combat can be awarded again (re-entry after victory starts at score 0)
  C.telemetry = freshTelemetry(); // story-019: the accumulator restarts beside score/kills (the L453 pattern) — the mutation "forget to zero" is pinned by the restart-parity assert
  C.telemetryPuBase = POWERUPS.stats(); // the pickup counters are per-page cumulative (powerups.js) — the run reads deltas over this entry baseline
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
  C.lastBossShow = null; C.lastBossPct = -1; C.lastBannerSig = null; C.lastKillMark = false; // stage-6 H1: same rewrite force for the boss bar / banner / marker
  C.bannerT = BANNER_T; C.killMarkLeft = 0; // stage-6 H1: the entry wave is announced like every increment; no marker rides a re-entry
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
  AIM.lockTick(dt); // story 7.4: dt param (the retain grace AIMK.LOCK_GRACE is time-based) — the lock scan settles THIS tick before the fire path — spawnBolt's aimDir reads a lock that includes the heading steered this frame (no 1-tick staleness on the spawn)
  fireTick(dt);
  boltsTick(dt);
  ENEMIES.tickEnemies(dt, C.pos, { damagePlayer, explosion: (pos) => EFFECTS.explosion(pos) }); // story-019: the bolt/ram tags ride the enemies.js call sites (the file's only two damage values: 12 = gunner/boss-volley bolt, 25 = ram)
  DRONES.tickDrones(dt, C.pos, { damagePlayer: (n) => damagePlayer(n, 'dive'), explosion: (pos) => EFFECTS.explosion(pos) }); // story-019: the orb's ONLY damage source is the dive — the api wrap tags it (drone.js zero-diff)
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
  balanceProbeTick(dt, C, probeEnv); // story-019: elite/table/telemetry walk (?balanceProbe=1) — the drive grows with the story's commits
  fireProbeTick(dt, C, probeEnv); // stage-6 W1: real-fire bolt capture (?fireProbe=1) — seeds targets, captures b.userData.dir of REAL fired bolts (CDP press via the harness arm flags); never spawns a bolt itself
  flightProbeTick(dt, C, probeEnv); // stage-7 story 7.0: flight-baseline walk (?flightProbe=1) — measures the OLD model (pitch clamp, no-roll, fov, cam-lag, R_HARD clamp); the 7.1/7.3 honest-red witness; zero gameplay change
  DRESSING.tickDressing(dt, Math.hypot(C.pos.x, C.pos.y - ARENA_Y, C.pos.z)); // story-017: slow whole-group rotation + shell opacity from 3D proximity (the ring's driver grammar)

  // shield regen after a clean 3 s — story-018: while SHIELD is active the regen delay reads 0
  // (GDD §3.3's intended reading: a hit still zeroes regenT, and the zero delay means regen
  // resumes immediately in-window; expiry restores the 3 s delay with no snap)
  C.regenT += dt;
  if (C.regenT >= (C.effects.SHIELD > 0 ? 0 : SHIELD_REGEN_DELAY)) C.shield = Math.min(SHIELD_MAX, C.shield + SHIELD_REGEN_RATE * dt);

  // story-018 effect timers — the loop moved to weapons.js effectsTick (review-fix split);
  // same position in the tick order (after the shield-regen block), same combat dt
  effectsTick(dt);

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
  C.camera.updateMatrixWorld(true); // story 7.4: every projection AFTER this point (pipper anchor state, lock bracket) reads THIS frame's camera — the matrixWorld was one frame stale behind the lookAt write
  EFFECTS.applyShake(dt);
  EFFECTS.tickEffects(dt); // drive the explosion pool — was never called (particles never faded)
  C.flow += ((C.boosting ? 1 : 0) - C.flow) * (1 - Math.exp(-4 * dt)); // smoothed boost rush
  combatFlow(dt, C.flow); // the field streams past the lane — asteroids, wrecks, planet, hole

  // story-009 audio — exactly one duck / alarm / proximity call per frame, nothing else (spec §7).
  // stage-6 A1a: + the listener feed — the ship position the panner/attenuation math reads
  // (additive audio hook; the spatialized one-shots in weapons/enemies/boss pass their own
  // source positions).
  C.proxScanT -= dt;
  if (!C.dead && C.proxScanT <= 0) { C.proxScanT = 0.15; C.nearest = scanNearest(); }
  setListener(C.pos);
  musicSetDuck(C.flow);
  alarmTick(dt, C.hp, C.dead);
  proximityTick(dt, C.dead ? null : C.nearest);

  // HUD — honest values, DOM writes only on change (feel: no per-frame innerHTML churn).
  // stage-6 H1: labeled meter rows (label + track + fill) — presentation only, the SAME
  // values the text stack wrote (honesty law: no new values). The BOSS text line LEFT this
  // write — the dedicated #boss-bar element owns boss HP now (one meaning per element;
  // boss.js stays zero-diff, its barLine() text write retired from this path).
  if (C.ui.hudBars) {
    const bars =
      `<div class="meter"><span class="ml">HULL ${fmt(C.hp)}</span><span class="mtrack"><i style="width:${fmt(clamp(C.hp, 0, HP_MAX))}%"></i></span></div>` +
      `<div class="meter"><span class="ml">SHIELD ${fmt(C.shield)}</span><span class="mtrack sh"><i style="width:${fmt(clamp(C.shield, 0, SHIELD_MAX) * 2)}%"></i></span></div>` +
      `<div class="meter"><span class="ml">BOOST ${fmt(C.boost * 100)}%</span><span class="mtrack bo"><i style="width:${fmt(C.boost * 100)}%"></i></span></div>`;
    if (bars !== C.lastBars) { C.ui.hudBars.innerHTML = bars; C.lastBars = bars; }
  }

  // stage-6 H1: dedicated boss HP bar — fed from BOSS.state() {hp,maxHp} (the state surface;
  // boss.js untouched). Change-gated on presence + the 5%-stepped fill fraction (the
  // charge-meter pattern). The dying window NEVER renders the bar (mirrors boss.js barLine's
  // rule — "never BOSS 0%" during the cinematic); gone after death; drained by clearCombat.
  if (C.ui.bossBar) {
    const bs = BOSS.state();
    const show = !!(bs && bs.maxHp > 0 && bs.phase !== 'dying');
    const pct = show ? Math.round(clamp(bs.hp / bs.maxHp, 0, 1) * 20) * 5 : -1;
    if (show !== C.lastBossShow || pct !== C.lastBossPct) {
      C.ui.bossBar.hidden = !show;
      if (show) C.ui.bossBar.style.setProperty('--w', pct);
      C.lastBossShow = show; C.lastBossPct = pct;
    }
  }

  // stage-6 H1: wave banner — announces each wave start (the enterCombat entry wave + the
  // wavesTick increment above). The #combat-online reveal grammar re-instance (template CSS);
  // inside #hud (input-events-none), top strip — never covers the reticle center (audit F3).
  // Change-gated on the composed signal (visibility + text); the timer itself decrements per
  // frame with zero DOM cost.
  if (C.ui.waveBanner) {
    C.bannerT -= dt;
    const sig = C.bannerT > 0 ? `WAVE ${fmt(C.wave)}` : '';
    if (sig !== C.lastBannerSig) {
      if (sig) { C.ui.waveBanner.hidden = false; void C.ui.waveBanner.offsetWidth; C.ui.waveBanner.classList.add('on'); }
      else { C.ui.waveBanner.classList.remove('on'); C.ui.waveBanner.hidden = true; }
      C.ui.waveBanner.textContent = sig;
      C.lastBannerSig = sig;
    }
  }

  // stage-6 H1: kill-only hit marker — weapons.js's registered-kill sites (raider + orb bolt
  // kills) stamp C.killMarkLeft = KILL_MARK_S through the seam; this writer owns the element +
  // the countdown. ANCHOR DECISION (the card's pick-one): the RETICLE — the sight-confirmation
  // convention (the confirmation reads where the player aims; the in-world explosion already
  // marks the death location), zero projection math in the synchronous kill sites (the
  // C.tmp/C.tmp2 clobber hazards), no matrixWorld staleness. ~150 ms real-time (the death-clock
  // division — the boss cinematic's slow-mo can never stretch it), then gone. The boss kill is
  // NOT a registered kill (no C.kills++ on that path) — no marker there; kill-only holds.
  if (C.ui.hitMark) {
    if (C.killMarkLeft > 0) C.killMarkLeft = Math.max(0, C.killMarkLeft - dt / Math.max(0.05, C.api.getTimeScale()));
    const show = C.killMarkLeft > 0 && !C.dead;
    if (show !== C.lastKillMark) {
      if (show) { C.ui.hitMark.style.left = C.retX + 'px'; C.ui.hitMark.style.top = C.retY + 'px'; }
      C.ui.hitMark.hidden = !show;
      C.lastKillMark = show;
    }
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

  AIM.hudTick(); // stage-6 W1: pipper + lock bracket — the change-gated writers live in aim-assist.js (camera + the lock state via the seam; the pip block's projection math above is the pattern)

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
  if (C.ui.bossBar) C.ui.bossBar.hidden = true; // stage-6 H1: the boss bar is combat's write — the pad never inherits it (the bars-clear class)
  if (C.ui.waveBanner) { C.ui.waveBanner.classList.remove('on'); C.ui.waveBanner.hidden = true; C.ui.waveBanner.textContent = ''; } // stage-6 H1: same class — the pad never inherits a wave banner
  if (C.ui.hitMark) C.ui.hitMark.hidden = true; // stage-6 H1: same class — the pad never inherits a kill marker
  C.lastBossShow = null; C.lastBossPct = -1; C.lastBannerSig = ''; C.bannerT = 0; C.killMarkLeft = 0; C.lastKillMark = false; // stage-6 H1: the banner's drained signal is '' (bannerVisible reads false on the pad); boss/marker gates force a rewrite on re-entry (the lastBars pattern)
  if (C.ui.reticle) { // story-018: the charge meter is combat's write — the pad gets a clean reticle
    C.ui.reticle.classList.remove('charge', 'charge-full');
    C.ui.reticle.style.removeProperty('--p');
  }
  AIM.resetAimHud(); // stage-6 W1: the pipper + bracket are combat's writes — the pad never inherits them (same class as the reticle clear above; drains the lock too)
  C.lastChips = null; C.lastChargePct = -1; C.lastChargeFull = null; // force one rewrite on re-entry
  if (C.ui.tele) C.ui.tele.textContent = ''; // TD-014 (story-013): the SPD line is combat's write —
  // it must not ride the pad until cruise rewrites (phases.js resets its lastSpd gate on combat.enter)
  for (const pip of C.pips) pip.style.opacity = '0'; // story-014 (found during evidence capture): combat's
  // last-frame pip state must not ride the pad — the pips are combat's writes, same class as the #hud-bars
  // clear above (pre-existing leak; the death-card REPLAY inherits this fix too)
  C.dead = false; C.deathT = 0; C.speed = 0;
  C.rockCooldown = 0;
  C.chargeT = 0; C.charging = false; // story-018: a mid-hold exit wipes the accumulator (GDD §3.2) — the death-card SKIP can never inherit it
  C.effects = { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 }; // story-018: timers + entities wiped with the pools
  C.fired = { stream: 0, charged: 0 };
  if (C.rim) { C.rim.material.opacity = 0; C.rim.visible = false; } // story-005: rim leaves the render list with combat (review R2-9)
  DRESSING.hideDressing(); // story-017: the ambient field + shell visual leave the render list with combat (rim-ring lifecycle — hidden, never disposed)
  setLaneVisible(true); // story-7.5: launch lane rocks restored for pad/ascent
}

/* ---------- probe surface (window.__stage2 reads these) ---------- */
function telemetryDump() { // story-019: one dump — the accumulator's live numbers + the pickup counters as deltas over the entry baseline (powerups.js's stats() is per-page cumulative; the delta keeps the run honest across restarts). Fresh objects — the harness never holds a live reference.
  const T = C.telemetry, s = POWERUPS.stats(), b = C.telemetryPuBase || s;
  return {
    kills: { ...T.kills }, eliteKills: { ...T.eliteKills }, chargedKills: T.chargedKills,
    shots: { ...T.shots }, hits: { ...T.hits }, damageTaken: { ...T.damageTaken },
    deathBy: T.deathBy, scoreBy: { ...T.scoreBy },
    waveReached: T.waveReached, waveTimes: [...T.waveTimes],
    pickups: {
      dropped: s.dropped - b.dropped, picked: s.picked - b.picked, expired: s.expired - b.expired,
      byKind: { SPREAD: s.byKind.SPREAD - b.byKind.SPREAD, OVERDRIVE: s.byKind.OVERDRIVE - b.byKind.OVERDRIVE, SHIELD: s.byKind.SHIELD - b.byKind.SHIELD },
    },
  };
}
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
    lock: AIM.enabled(), // stage-6 W1 honesty surface: the aim-lock toggle state (the pipper/bracket render state the harness can read; ?lock=0 reads OFF)
    lockTarget: AIM.lockState(), // stage-6 W1 honesty surface: null or { kind, x, y, z } — the bracket's anchor; NEVER 'boss' (excluded by construction)
    pipper: AIM.pipperState(), // stage-6 H1 honesty rider (W1's chair flag): { visible, divergenceDeg } — the pipper writer's OWN stored state, never recomputed (its visibility gate rides pointer-divergence, the same input-state class as the pre-law reticle)
    bannerVisible: C.lastBannerSig !== '', // stage-6 H1: the wave banner's real render state (the writer's change-gate)
    markerVisible: C.lastKillMark === true, // stage-6 H1: the hit marker's real render state
    telemetry: telemetryDump(), // story-019: the tuning surface (GDD §3.7) — probe reads only, zero player UI
    pos: C.pos.toArray().map((v) => +v.toFixed(2)), // probe surface — flow-check's keyboard-motion assert (story-003)
    dead: C.dead,
  };
}
export function probeDamagePlayer(n) { damagePlayer(n); }
export function deathFastForward() { // dying: Enter/Space skip the slow-mo (main routes here; no-op once the card is up)
  if (C.dead) C.deathT = DEATH_SLOWMO;
}
export function pauseCancelCharge() { // story-018 review fix: input.js's setPaused(true) calls this —
  // the accumulator NEVER survives a pause. Covers the release-during-pause ordering: the window
  // pointerup flips input.fire while tickCombat is halted, so on resume the release branch would
  // otherwise see charging true and fire the charged bolt (the red the new assert pins). The
  // suggested combat→input import of `paused` is an import cycle (input.js imports combat.js —
  // dep-check rule 1), so the signal travels this direction instead: input.js owns the pause
  // event, combat.js owns the state. The fireTick key-set read stays as defense in depth for
  // the still-holding case.
  C.chargeT = 0; C.charging = false;
}
