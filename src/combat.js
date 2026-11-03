// STAGE TWO — COMBAT CORE (S4): chase-cam space combat around the hero rocket.
// Owns: player ship pose (re-parents the rocket into a yaw/pitch/roll pose group),
// mouse+keys steering (no pointer lock), soft-clamped arena, hold-fire pooled bolts,
// shield→HP damage with regen, boost meter, derived waves (via enemies.js), death
// slow-mo handoff. Contained state contract (§8.6): clearCombat() re-parents the
// rocket, drains every pool and resets all flags — restarts allocate nothing new.
import { THREE } from 'stage-two-lib';
import * as ENEMIES from './enemies.js';
import * as EFFECTS from './effects.js';
import { makePool } from './pool.js';
import { beep, sweep, noiseBurst, loopStart, loopsStopAll } from './audio.js';
import { stageShip, combatFlow } from './launch.js';

const ARENA_Y = 18;
const ARENA_HALF = 80;       // player soft clamp (raiders spawn outside and fly in) — 3x after the "stuck at the edge" report
const MAX_SPEED = 17;        // bumped with the arena — same crossing time as the old 26 arena at 14
const BOOST_MULT = 1.9;
const FIRE_INTERVAL = 1 / 8; // ~8/s hold-fire
const BOLT_SPEED = 42;
const BOLT_LIFE = 1.2;
const BOLT_POOL = 24;
const HP_MAX = 100, SHIELD_MAX = 50, SHIELD_REGEN_DELAY = 3, SHIELD_REGEN_RATE = 14;
const DEATH_SLOWMO = 0.7;    // seconds of real time at timeScale 0.3 before gameover (a click lands it sooner)
const SCORE_DRONE = 100, SCORE_GUNNER = 150, SCORE_WAVE = 150;

const C = {
  ready: false, scene: null, camera: null, rocket: null, ui: null, api: null,
  pose: null, tilt: null,
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), heading: 0, bank: 0,
  hp: HP_MAX, shield: SHIELD_MAX, regenT: 0, dead: false, deathT: 0,
  fireT: 0, boost: 1, boosting: false,
  wave: 0, waveGapT: 0, score: 0, kills: 0,
  bed: null, scriptT: -1, scriptDone: false,
  tmp: new THREE.Vector3(), tmp2: new THREE.Vector3(),
  ndc: new THREE.Vector3(), // hoisted unproject scratch (feel: no per-frame allocation)
  flow: 0, // smoothed boost → field-flow factor (0 idle drift, 1 rush)
  pips: [], pipDir: new THREE.Vector3(), pipFwd: new THREE.Vector3(), pipInv: new THREE.Quaternion(),
  retX: -1, retY: -1, lastBars: null, lastScore: null, // change-gates for DOM writes
};
const qs = new URLSearchParams(location.search);
const SCRIPTED_KILL = qs.get('scriptedKill') === '1';

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
  return out.set(Math.sin(C.heading), 0, Math.cos(C.heading));
}

/* ---------- input → steering ---------- */
function steer(dt) {
  const input = C.api.input;
  const keys = input.keys;
  const kb = C.tmp.set(0, 0, 0);
  if (keys.has('KeyW') || keys.has('ArrowUp')) kb.z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) kb.z += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) kb.x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) kb.x += 1;

  const kbOn = kb.lengthSq() > 0;
  let target = null;
  if (kbOn) {
    target = C.tmp2.copy(C.pos).addScaledVector(kb.normalize(), 6); // direction only — length is set below
  } else if (input.mouseActive) {
    // mouse NDC → ray → intersect the arena plane y=ARENA_Y (clamp target into arena)
    const ndc = C.ndc.set(input.mouse.x, input.mouse.y, 0.5).unproject(C.camera);
    const dir = ndc.sub(C.camera.position).normalize();
    if (Number.isFinite(dir.x) && Math.abs(dir.y) > 1e-4) { // parallel-to-plane guard
      const tHit = (ARENA_Y - C.camera.position.y) / dir.y;
      if (tHit > 0) target = C.tmp2.set(C.camera.position.x + dir.x * tHit, ARENA_Y, C.camera.position.z + dir.z * tHit);
    }
  }
  if (!target) target = C.tmp2.copy(C.pos);

  target.x = clamp(target.x, -ARENA_HALF, ARENA_HALF);
  target.z = clamp(target.z, -ARENA_HALF, ARENA_HALF);

  const boostWant = (input.boost || keys.has('ShiftLeft') || keys.has('ShiftRight')) && C.boost > 0.12 && target.distanceTo(C.pos) > 1.5;
  C.boosting = boostWant;
  C.boost = clamp(C.boost + (boostWant ? -0.45 : 0.25) * dt, 0, 1);
  const speed = MAX_SPEED * (boostWant ? BOOST_MULT : 1);

  const desired = C.tmp.copy(target).sub(C.pos);
  if (kbOn || desired.lengthSq() > speed * speed) desired.setLength(speed); // keyboard thrust = FULL speed (story-002: was capped at 6 — the 'WASD dead' feel)
  const k = 1 - Math.exp(-7.5 * dt); // feel: snappier pursuit (was 6)
  C.vel.lerp(desired, k);
  C.pos.addScaledVector(C.vel, dt);

  // soft arena clamp + warning
  const out = Math.abs(C.pos.x) > ARENA_HALF || Math.abs(C.pos.z) > ARENA_HALF;
  C.pos.x = clamp(C.pos.x, -ARENA_HALF, ARENA_HALF);
  C.pos.z = clamp(C.pos.z, -ARENA_HALF, ARENA_HALF);
  if (C.ui.warn) {
    C.ui.warn.hidden = !out || C.dead;
    C.ui.warn.textContent = 'RETURNING TO SECTOR';
  }

  // heading follows velocity when it means anything; bank reads the turn
  if (C.vel.lengthSq() > 0.6) C.heading = Math.atan2(C.vel.x, C.vel.z);
  const side = C.vel.x * Math.cos(C.heading) - C.vel.z * Math.sin(C.heading); // lateral component
  C.bank += (clamp(-side * 0.09, -0.7, 0.7) - C.bank) * (1 - Math.exp(-7 * dt));
}

/* ---------- weapons ---------- */
function fireTick(dt) {
  const wantFire = C.api.input.fire;
  C.fireT -= dt;
  if (!wantFire || C.dead || C.fireT > 0) return;
  C.fireT = FIRE_INTERVAL;
  const b = C.bolts.spawn();
  noseWorld(b.position);
  forward(b.userData.dir);
  b.userData.life = BOLT_LIFE;
  b.lookAt(C.tmp.copy(b.position).add(b.userData.dir));
  sweep({ f0: 1500, f1: 320, dur: 0.09, vol: 0.12, type: 'square' });
}

function boltsTick(dt) {
  C.bolts.update(dt, (b) => {
    b.userData.life -= dt;
    b.position.addScaledVector(b.userData.dir, BOLT_SPEED * dt);
    if (b.userData.life <= 0) { C.bolts.kill(b); return; }
    // bolt × drone scan (both pools are small — brute force is the honest option)
    ENEMIES.eachAlive((d) => {
      if (!b.userData.alive) return;
      const dx = d.position.x - b.position.x, dz = d.position.z - b.position.z;
      if (dx * dx + dz * dz < 1.1) {
        C.bolts.kill(b);
        EFFECTS.explosion(d.position);
        noiseBurst({ dur: 0.28, vol: 0.4, f0: 900, f1: 140 });
        if (ENEMIES.hitDrone(d, 1)) {
          C.score += d.userData.kind === 'gunner' ? SCORE_GUNNER : SCORE_DRONE;
          C.kills++;
          EFFECTS.shake(0.06); // kill feedback (J)
          beep({ freq: 620, dur: 0.09, vol: 0.16, type: 'triangle' });
        }
      }
    });
  });
}

/* ---------- damage / death ---------- */
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
  if (C.dead) return;
  if (ENEMIES.aliveCount() === 0 && ENEMIES.queuedCount() === 0) {
    if (C.waveGapT <= 0) { C.waveGapT = 1.6; if (C.wave > 0) C.score += SCORE_WAVE * C.wave; }
    C.waveGapT -= dt;
    if (C.waveGapT <= 0) { C.waveGapT = 0; C.wave++; ENEMIES.startWave(C.wave, C.pos); }
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

/* ---------- phase API ---------- */
export function enterCombat(scene, camera, rocket, ui, api) {
  prepareCombat(scene, camera, rocket, ui, api);
  reparentRocket(true);
  C.pos.set(0, ARENA_Y, 0);
  C.vel.set(0, 0, 0);
  C.heading = 0; C.bank = 0;
  C.hp = HP_MAX; C.shield = SHIELD_MAX; C.regenT = 0; C.dead = false; C.deathT = 0;
  C.fireT = 0; C.boost = 1; C.boosting = false;
  C.score = 0; C.kills = 0; C.wave = 1; C.waveGapT = 0;
  C.scriptT = -1; C.scriptDone = false; C.scriptDrone = null;
  C.flow = 0;
  C.lastBars = null; C.lastScore = null; // clearCombat emptied the DOM — force one HUD rewrite
  C.bolts.clear();
  ENEMIES.clearEnemies();
  EFFECTS.clearEffects();
  if (ui.warn) ui.warn.hidden = true;
  api.setTimeScale(1);
  ENEMIES.startWave(C.wave, C.pos);
  loopsStopAll(0.2);
  C.bed = loopStart({ freq: 46, vol: 0.05, playback: 0.4 }); // deep-space bed
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // Space must not re-click title buttons
}

export function tickCombat(dt, t) {
  const p = C.pose;
  steer(dt);
  fireTick(dt);
  boltsTick(dt);
  ENEMIES.tickEnemies(dt, C.pos, { damagePlayer, explosion: (pos) => EFFECTS.explosion(pos) });
  wavesTick(dt);
  scriptedKillTick(dt);

  // shield regen after a clean 3 s
  C.regenT += dt;
  if (C.regenT >= SHIELD_REGEN_DELAY) C.shield = Math.min(SHIELD_MAX, C.shield + SHIELD_REGEN_RATE * dt);

  // ship pose + chase cam
  p.position.copy(C.pos);
  p.rotation.y = C.heading;
  p.rotation.z = C.bank;
  const camTarget = C.tmp.copy(C.pos).addScaledVector(forward(C.tmp2), -7.5 - C.vel.length() * 0.22); // velocity trail (story-002): thrust visibly surges the ship ahead in frame
  camTarget.y += 3.4;
  const k = 1 - Math.exp(-5 * dt); // feel: trail reads — 6 -> 5 (story-002)
  C.camera.position.lerp(camTarget, k);
  C.camera.lookAt(C.pos.x + forward(C.tmp2).x * 4, ARENA_Y, C.pos.z + C.tmp2.z * 4);
  EFFECTS.applyShake(dt);
  EFFECTS.tickEffects(dt); // drive the explosion pool — was never called (particles never faded)
  C.flow += ((C.boosting ? 1 : 0) - C.flow) * (1 - Math.exp(-4 * dt)); // smoothed boost rush
  combatFlow(dt, C.flow); // the field streams past the lane — asteroids, wrecks, planet, hole

  // HUD — honest values, DOM writes only on change (feel: no per-frame innerHTML churn)
  if (C.ui.hudBars) {
    const bars =
      `HULL ${fmt(C.hp)}<div class="bar"><i style="width:${fmt(clamp(C.hp, 0, HP_MAX))}%"></i></div>` +
      `SHIELD ${fmt(C.shield)}<div class="bar sh"><i style="width:${fmt(clamp(C.shield, 0, SHIELD_MAX) * 2)}%"></i></div>` +
      `BOOST ${fmt(C.boost * 100)}%`;
    if (bars !== C.lastBars) { C.ui.hudBars.innerHTML = bars; C.lastBars = bars; }
  }
  if (C.ui.hudScore) {
    const score = `SCORE ${fmt(C.score)}   WAVE ${fmt(C.wave)}`;
    if (score !== C.lastScore) { C.ui.hudScore.textContent = score; C.lastScore = score; }
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
  ENEMIES.clearEnemies();
  EFFECTS.clearEffects();
  loopsStopAll(0.25);
  C.bed = null;
  reparentRocket(false);
  if (C.ui.warn) C.ui.warn.hidden = true;
  if (C.ui.hudBars) C.ui.hudBars.innerHTML = ''; // pad phases must not inherit combat bars
  if (C.ui.hudScore) C.ui.hudScore.textContent = '';
  C.dead = false; C.deathT = 0;
}

/* ---------- probe surface (window.__stage2 reads these) ---------- */
export function combatState() {
  return {
    hp: C.hp, shield: C.shield, score: C.score, wave: C.wave, kills: C.kills,
    enemies: ENEMIES.aliveCount() + ENEMIES.queuedCount(),
    particles: EFFECTS.particleCount(),
    bolts: C.bolts ? C.bolts.live : 0,
    ebolts: ENEMIES.eboltCount(),
    boost: C.boost,
    pos: C.pos.toArray().map((v) => +v.toFixed(2)), // probe surface — flow-check's keyboard-motion assert (story-003)
    dead: C.dead,
  };
}
export function probeDamagePlayer(n) { damagePlayer(n); }
export function deathFastForward() { // dying: Enter/Space skip the slow-mo (main routes here; no-op once the card is up)
  if (C.dead) C.deathT = DEATH_SLOWMO;
}
