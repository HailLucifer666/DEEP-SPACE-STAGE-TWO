// STAGE TWO — story-017 DRESSING probe drive (one walk per file — the story-018 split
// precedent; the walk moved verbatim from src/probes.js, Task A follow-up 2026-11-10: the
// file hit the <800-line project rule after the Task A warn/shell extension, and the split
// is the fix the probes.js header documents). This module owns ?dressingProbe=1 and NOTHING
// else. probes.js re-exports the tick + the reset so combat.js's import surface stays
// byte-identical; resetProbes delegates the reset here (stale-delete hygiene, report deleted
// with the state). probes never import combat.js — the tick receives combat state + the pure
// helpers/constants it needs as arguments (probeEnv).
// Deterministic walk of the combat-only ambient dressing (droneProbe/pitchProbe pattern).
// Stages, in order (story-017 original walk + the Task A 2026-11-10 warn/shell extension):
//   entry (0 s) — snap the field visibility at combat entry (the re-show half of the
//     rim-ring lifecycle), clear the enemy field + reseat the ship at O (probe-owned
//     precondition; bossProbe/pitchProbe precedent), then start the clearance walk: W cruise
//     + full-yaw orbit (drift circle radius ≈7 u around O) + varied-pitch pulses (R/F 0.35 s
//     every 2 s). The field is cleared EVERY tick during the walk + HP/shield healed
//     (pitchProbe precedent) — the walk must not die mid-drive with wave raiders orbiting
//     the ship.
//   walk (10 s) — sample the nearest instance-to-ship 3D distance every tick (min over the
//     drive).
//   rock park (r3 78; bossProbe shell-park precedent: C.pos set, vel/speed zeroed, keys
//     released at walk end) — the story-7.5 rock-collision witness (collideRocks on rock 0).
//   warn parks (Task A 2026-11-10, Story 7.6 Step 3 sanctioned asserts) — probe-owned
//     re-parks at r3 65 / 75 / 20, each settled 0.2 s before its #warn sample (the warn
//     writer in combat.js steer recomputes from r3 every tick; vel/speed zeroed so the park
//     is steady). Samples the element's live render state: visible / text / .danger class.
//   report — { ambientCount, shellFill, clearance, shellRemoved (MEASURED — shellScan, see
//     that helper), lifecycle: { shownOnEnter }, rockHit, warn: { approaching, turnBack,
//     inside } } on window.__stage2.dressingProbe (+ lastReport parity via api.report).
//     The clear/re-show lifecycle half is verified by the HARNESS via __stage2.dressingLive()
//     across a death → gameover → SKIP → combat re-entry walk (see flow-check's story-017
//     block) — the in-page tick cannot witness the gameover gap (it only runs in combat).
import * as ENEMIES from './enemies.js';
import * as DRESSING from './arena-dressing.js'; // story-017: combat-only ambient field (reads its probe surfaces — never the reverse)

const qs = new URLSearchParams(location.search);
const DRESSING_PROBE = qs.get('dressingProbe') === '1'; // story-017: deterministic dressing walk (ambient field + shell visual)

const DD = { t: 0, stage: 0, mark: 0, sub: null, done: false, minCl: 0, samples: 0, pulses: [], entryShown: null, opacityAt78: null, opacityAt60: null, rockHit: null, warn65: null, warn75: null, warnIn: null }; // story-017 dressing walk — page-scoped (see the reset note + dressingProbeTick); Task A 2026-11-10 adds the warn-park + rockHit sample fields

export function resetDressingProbe() { // probes.js resetProbes delegates (the story-018 split's call order)
  // story-017: the dressing walk's report gets the same stale-free hygiene. Its MEASUREMENT
  // state (DD) is deliberately NOT fully reset here — the walk is page-scoped: it begins at
  // combat entry and its lifecycle witness spans the page's combat re-entries, so `done`
  // latches across reset calls (see dressingProbeTick).
  Object.assign(DD, { t: 0, stage: 0, mark: 0, sub: null, minCl: 0, samples: 0, pulses: [], entryShown: null, opacityAt78: null, opacityAt60: null, rockHit: null, warn65: null, warn75: null, warnIn: null }); // Task A 2026-11-10: the warn-park + rockHit samples join the same stale-free hygiene
  window.__stage2.dressingProbeLive = false;
  delete window.__stage2.dressingProbe;
}

export function dressingProbeTick(dt, C, env) {
  if (!DRESSING_PROBE || DD.done) return;
  DD.t += dt;
  window.__stage2.dressingProbeLive = true;
  const keys = C.api.input.keys;

  if (DD.stage === 0) { // entry snapshot + walk start
    DD.entryShown = DRESSING.fieldVisible();
    C.hp = env.HP_MAX; C.shield = env.SHIELD_MAX;
    ENEMIES.clearEnemies();
    C.pos.set(0, env.ARENA_Y, 0); C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0;
    C.api.input.mouseActive = false; // pointer parked — no steering interference
    keys.delete('KeyW'); keys.delete('KeyA'); keys.delete('KeyD'); keys.delete('KeyR'); keys.delete('KeyF'); keys.delete('Space');
    keys.add('KeyW'); keys.add('KeyA'); // cruise + full-yaw orbit
    DD.pulses = [];
    for (let i = 1; i <= 9; i += 2) DD.pulses.push({ at: i, key: 'KeyR', on: false, releaseAt: 0 }); // up
    for (let i = 2; i <= 8; i += 2) DD.pulses.push({ at: i, key: 'KeyF', on: false, releaseAt: 0 }); // down
    DD.mark = DD.t; DD.minCl = Infinity; DD.samples = 0;
    DD.stage = 1;
    return;
  }

  if (DD.stage === 1) { // the 10 s clearance walk
    ENEMIES.clearEnemies(); // the field never crowds the walk — wave raiders respawn ~1.6 s
    if (C.hp < env.HP_MAX) C.hp = env.HP_MAX;
    if (C.shield < env.SHIELD_MAX) C.shield = env.SHIELD_MAX;
    for (const p of DD.pulses) {
      if (!p.on && DD.t >= DD.mark + p.at) { keys.add(p.key); p.on = true; p.releaseAt = DD.t + 0.35; }
      if (p.on && DD.t >= p.releaseAt) { keys.delete(p.key); p.on = false; }
    }
    const near = DRESSING.nearestTo(C.pos);
    if (near) { DD.minCl = Math.min(DD.minCl, near.d); DD.samples++; }
    if (DD.t >= DD.mark + 10.0) {
      keys.delete('KeyW'); keys.delete('KeyA');
      for (const p of DD.pulses) keys.delete(p.key);
      DD.stage = 2; DD.sub = 'park78'; DD.mark = DD.t;
      C.pos.set(0, env.ARENA_Y, 78); C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0; // r3 78 park
    }
    return;
  }

  if (DD.stage === 2) { // rock-collision witness at the r3 78 park, then re-park for the warn stage
    const r0 = DRESSING.getRock ? DRESSING.getRock(0) : null;
    let rockHit = null;
    if (r0) {
      // verify world rock collision detection
      const testPos = { x: r0.wx, y: r0.wy, z: r0.wz };
      const normal = C.tmp;
      const pen = DRESSING.collideRocks(testPos, 1.4, normal);
      rockHit = {
        detected: pen > 0,
        radius: r0.radius,
        pen: +pen.toFixed(3),
        hasNormal: normal.lengthSq() > 0,
      };
    }
    DD.rockHit = rockHit;
    // Task A 2026-11-10 (Story 7.6 Step 3): probe-owned re-parks for the two-stage #warn
    // asserts (bossProbe shell-park precedent). Keys are already released (walk end); the
    // warn writer recomputes from r3 on the next steer tick, so each park settles 0.2 s.
    ENEMIES.clearEnemies(); C.hp = env.HP_MAX; C.shield = env.SHIELD_MAX; // walk discipline — the stationary ship must not die mid-sampling
    C.pos.set(0, env.ARENA_Y, 65); C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0;
    DD.mark = DD.t; DD.sub = 'warn65'; DD.stage = 3;
    return;
  }

  if (DD.stage === 3) { // warn park 60 <= r3 < 72 → APPROACHING ZONE EDGE, .danger ABSENT
    ENEMIES.clearEnemies();
    if (C.hp < env.HP_MAX) C.hp = env.HP_MAX;
    if (C.shield < env.SHIELD_MAX) C.shield = env.SHIELD_MAX;
    if (DD.t >= DD.mark + 0.2) {
      DD.warn65 = warnSample(C, env.ARENA_Y);
      C.pos.set(0, env.ARENA_Y, 75); C.vel.set(0, 0, 0); C.speed = 0;
      DD.mark = DD.t; DD.sub = 'warn75'; DD.stage = 4;
    }
    return;
  }

  if (DD.stage === 4) { // warn park r3 >= 72 → END OF COMBAT ZONE - TURN BACK, .danger PRESENT
    ENEMIES.clearEnemies();
    if (C.hp < env.HP_MAX) C.hp = env.HP_MAX;
    if (C.shield < env.SHIELD_MAX) C.shield = env.SHIELD_MAX;
    if (DD.t >= DD.mark + 0.2) {
      DD.warn75 = warnSample(C, env.ARENA_Y);
      C.pos.set(0, env.ARENA_Y, 20); C.vel.set(0, 0, 0); C.speed = 0;
      DD.mark = DD.t; DD.sub = 'warnIn'; DD.stage = 5;
    }
    return;
  }

  if (DD.stage === 5) { // warn park back inside r3 < 60 → hidden; then the measured report
    ENEMIES.clearEnemies();
    if (C.hp < env.HP_MAX) C.hp = env.HP_MAX;
    if (C.shield < env.SHIELD_MAX) C.shield = env.SHIELD_MAX;
    if (DD.t >= DD.mark + 0.2) {
      DD.warnIn = warnSample(C, env.ARENA_Y);
      DD.done = true;
      const probe = {
        ambientCount: DRESSING.fieldCount(),
        shellFill: DRESSING.shellFill(),
        clearance: { min: +DD.minCl.toFixed(2), samples: DD.samples },
        shellRemoved: shellScan(C.scene), // Task A 2026-11-10: MEASURED (was the literal `true` — a tautology, defect class false green)
        lifecycle: { shownOnEnter: DD.entryShown },
        rockHit: DD.rockHit,
        warn: { approaching: DD.warn65, turnBack: DD.warn75, inside: DD.warnIn }, // Task A 2026-11-10 (Story 7.6 Step 3)
      };
      window.__stage2.dressingProbe = probe;
      window.__stage2.dressingProbeLive = false;
      C.api.report({ dressingProbe: probe }); // parity — lands on __stage2.lastReport too
    }
    return;
  }
}

/* ---------- Task A 2026-11-10: the measured shell witness + the #warn sample ----------
 * shellRemoved used to be the unconditional literal `true` in the dressing probe report —
 * a tautology (defect class: false green; it could never fail). It is now MEASURED off the
 * live scene graph: ANY wireframe-material Mesh OR Line/LineSegments at arena-shell scale
 * fails the witness, so a shell existing again (even hidden — traverse does not skip
 * invisible objects) turns the harness assert red. The removed boundary shell (story 7.6)
 * was IcosahedronGeometry(78, 2) wireframe; a grep of src/ (2026-11-10) shows ZERO wireframe
 * materials and ZERO line-class geometry in the game, and the largest legitimate scene
 * objects are single-digit u, so the ≥ 40 u floor cannot false-positive on live geometry.
 * Review finding 3 (Task A follow-up, 2026-11-10): the first cut witnessed only o.isMesh —
 * a shell reintroduced as LineSegments/Line (isLine: no wireframe flag exists on line
 * materials, and a line cage is the MOST natural future boundary shape) evaded it. The
 * class is closed: isLine || isLineSegments fails on the same radius floor.
 * MUTATION-PROVEN 2026-11-10:
 *   (a) a wireframe IcosahedronGeometry(78, 2) MESH re-added to the scene during this probe
 *       → shellRemoved measured FALSE → flow-check RED 'boundary wireframe shell removed
 *       (story 7.6)'; restored → green.
 *   (b) the same shell re-added as THREE.LineSegments (a Line, not a Mesh) during this
 *       probe → shellRemoved measured FALSE → the same assert RED for that reason;
 *       restored → green. (build/flow-taskA-baseline.txt holds the original green; the red
 *       transcripts were read from the mutation runs.) */
const SHELL_SCAN_MIN_R = 40; // u — shell-scale floor (the shell was 78; legit meshes ≤ ~single-digit u)
function shellScan(scene) {
  if (!scene) return false; // absent scene → honest red (absence must never read as a green witness)
  let shellFound = false;
  scene.traverse((o) => {
    if (shellFound) return;
    const isMesh = o.isMesh === true;
    const isLine = o.isLine === true || o.isLineSegments === true; // review finding 3: the line classes close the evasion (no wireframe flag exists there — the class itself is the witness)
    if (!isMesh && !isLine) return;
    if (isMesh) { // meshes witness only on a wireframe material; lines witness on the class alone
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let wire = false;
      for (let i = 0; i < mats.length; i++) { if (mats[i] && mats[i].wireframe) { wire = true; break; } }
      if (!wire) return;
    }
    if (!o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); // one-shot probe report path, NOT a tick path
    const r = o.geometry.boundingSphere ? o.geometry.boundingSphere.radius : 0;
    if (r >= SHELL_SCAN_MIN_R) shellFound = true; // a shell-scale wireframe mesh / line cage — the shell is back
  });
  return !shellFound;
}

// the #warn element's live render state (combat.js steer writes it every tick from r3)
function warnSample(C, arenaY) {
  const w = C.ui && C.ui.warn;
  if (!w) return null; // element-absent build → honest red (the assert reads the null)
  return {
    r3: +Math.hypot(C.pos.x, C.pos.y - arenaY, C.pos.z).toFixed(2), // the measured park radius — provenance for the assert
    visible: w.hidden !== true,
    text: w.textContent || '',
    danger: w.classList.contains('danger'),
  };
}
