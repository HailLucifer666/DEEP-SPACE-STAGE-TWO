// STAGE TWO — plan-gap close 2026-11-11: story-7.7 HUD-state probe drive (one walk per file —
// the story-018 split precedent). Owns ?hudProbe=1 and NOTHING else. probes.js re-exports the
// tick + the reset so combat.js's import surface stays byte-identical; resetProbes delegates
// the reset here. probes never import combat.js — the tick receives combat state + the pure
// helpers (probeEnv); the entity seams it needs (ENEMIES.clearEnemies drains BOTH pools per
// §8.6) are the same public surfaces every other drive uses.
//
// WHY THIS WALK EXISTS: the whole-branch audit (2026-11-11) found five story 7.7 states with no
// battery coverage — the #hud-score HOSTILES line (step 8), the WAVE CLEAR banner window (step
// 8), the HULL CRITICAL chip + #hitveil.crit sustained toggle (step 5), the CHARGING chip (step
// 3), and the lock bracket's distance readout (step 3 — the Task A dead-code pass removed its
// unwired predecessor; the child + writer land together here). Each is sampled at its real DOM
// element AFTER the game's own change-gated writers ran (the warnSample / probes-powerup
// chips-read precedent) — every field reds by absence when a writer never fires, never a
// vacuous green. This page runs WITHOUT ?lock=0: the bracket stage needs the real lock.
import { THREE } from 'stage-two-lib';
import * as ENEMIES from './enemies.js';
import * as DRONES from './drone.js';

const qs = new URLSearchParams(location.search);
const HUD_PROBE = qs.get('hudProbe') === '1';

// walk state (droneProbe pattern: plain state HERE, reset by resetHudProbe on combat entry)
const HP = {
  t: -1, stage: 0, mark: 0, done: false, brMark: 0,
  fwd: new THREE.Vector3(), // camera-forward scratch (probe-only path — never a per-frame production allocation; a REAL Vector3: getWorldDirection calls .set on it)
  hostiles: null, waveClear: null, critical: null, bracket: null, charging: null,
};

export function resetHudProbe() { // stale-delete hygiene (the resetChargeProbe pattern)
  Object.assign(HP, { t: -1, stage: 0, mark: 0, done: false, brMark: 0, hostiles: null, waveClear: null, critical: null, bracket: null, charging: null });
  delete window.__stage2.hudProbe;
}

function bannerText() {
  const b = document.getElementById('wave-banner');
  return b ? b.textContent : null;
}
function chipsText() {
  const c = document.getElementById('hud-chips');
  return c ? c.textContent : '';
}

export function hudProbeTick(dt, C, env) {
  if (!HUD_PROBE || HP.done) return;
  HP.t += dt;

  if (HP.stage === 0) { // wait for the entry wave's spawns, then give the change-gated writers frames
    if (HP.mark === 0) HP.mark = HP.t;
    if (ENEMIES.aliveCount() > 0) { HP.stage = 1; HP.mark = HP.t; }
    else if (HP.t - HP.mark > 25) { HP.done = true; } // no spawns → every assert reds by absence
    return;
  }
  if (HP.stage === 1) { // HOSTILES n vs the real alive count (story 7.7 step 8)
    const scoreEl = document.getElementById('hud-score');
    const alive = ENEMIES.aliveCount() + DRONES.aliveCount();
    HP.hostiles = { line: scoreEl ? scoreEl.textContent : null, alive };
    ENEMIES.clearEnemies(); // §8.6: drains BOTH pools — the field is clear, wavesTick arms the 1.6 s gap
    HP.stage = 2; HP.mark = HP.t;
    return;
  }
  if (HP.stage === 2) { // WAVE CLEAR inside the gap, then the next wave's WAVE n banner
    if (!HP.waveClear) HP.waveClear = { clearShown: false, nextShown: false, clearText: null, nextText: null };
    const bText = bannerText();
    if (bText === 'WAVE CLEAR') {
      HP.waveClear.clearText = bText;
      HP.waveClear.clearShown = true;
    }
    if (HP.waveClear.clearShown && typeof bText === 'string' && bText.indexOf('WAVE ') === 0 && bText !== 'WAVE CLEAR') {
      HP.waveClear.nextText = bText;
      HP.waveClear.nextShown = true;
      HP.stage = 3; HP.mark = HP.t;
      ENEMIES.clearEnemies(); // quiet the sky for the hp/charge stages (a stray bolt would fight the <25 HP sample)
    } else if (HP.t - HP.mark > 10) { // gap 1.6 s + banner 2.0 s — 10 s is generous; the cap keeps the deadline honest
      HP.stage = 3; HP.mark = HP.t;
      ENEMIES.clearEnemies();
    }
    return;
  }
  if (HP.stage === 3) { // HULL CRITICAL chip + sustained veil-crit + the track class (story 7.7 step 5)
    if (HP.t - HP.mark >= 0.3) {
      C.hp = 20; // below the plan's 25 threshold — the same direct-state seam the warn parks use
      HP.stage = 4; HP.mark = HP.t;
    }
    return;
  }
  if (HP.stage === 4) {
    if (HP.t - HP.mark >= 0.3) {
      const veil = document.getElementById('hitveil');
      HP.critical = {
        chipShown: chipsText().indexOf('HULL CRITICAL') >= 0,
        veilCrit: !!veil && veil.classList.contains('crit'),
        trackCrit: !!document.querySelector('#hud-bars .mtrack.crit'),
        chipGone: false,
        veilGone: false,
      };
      C.hp = env.HP_MAX; // heal — the gone-half is the false-positive control
      HP.stage = 45; HP.mark = HP.t;
    }
    return;
  }
  if (HP.stage === 45) {
    if (HP.t - HP.mark >= 0.3) {
      const veil = document.getElementById('hitveil');
      HP.critical.chipGone = chipsText().indexOf('HULL CRITICAL') < 0;
      HP.critical.veilGone = !veil || !veil.classList.contains('crit');
      HP.stage = 5; HP.mark = HP.t;
    }
    return;
  }
  if (HP.stage === 5) { // bracket distance (story 7.7 step 3): seat a raider on the camera axis,
    // let the REAL lock acquire, then read the .dist-label child the hudTick writer maintains
    C.camera.getWorldDirection(HP.fwd);
    HP.brMark = HP.t;
    ENEMIES.spawnForProbe({
      x: C.camera.position.x + HP.fwd.x * 40,
      y: C.camera.position.y + HP.fwd.y * 40,
      z: C.camera.position.z + HP.fwd.z * 40,
    });
    HP.stage = 6;
    return;
  }
  if (HP.stage === 6) {
    const st = (window.__stage2 && window.__stage2.combatState) ? window.__stage2.combatState() : null;
    if (st && st.lockTarget) { HP.stage = 7; HP.mark = HP.t; return; } // 7.4 DONE WHEN: lock acquires within a frame of entering the cone
    if (HP.t - HP.brMark > 6) { HP.bracket = { locked: false, distText: null }; HP.stage = 7; HP.mark = HP.t; } // honest null → red by absence
    return;
  }
  if (HP.stage === 7) {
    if (HP.t - HP.mark >= 0.3) {
      const br = document.getElementById('lock-bracket');
      const lbl = br ? br.querySelector('.dist-label') : null;
      HP.bracket = {
        locked: !!br && !br.hidden,
        distText: lbl ? lbl.textContent : null,
      };
      ENEMIES.clearEnemies();
      if (C.api && C.api.input) C.api.input.fire = true; // hold fire so weapons.js fireTick doesn't clear charging
      C.chargeT = 0.7;
      C.charging = true;
      HP.stage = 8; HP.mark = HP.t;
    }
    return;
  }
  if (HP.stage === 8) {
    if (C.api && C.api.input) C.api.input.fire = true;
    C.chargeT = 0.7;
    C.charging = true;
    if (HP.t - HP.mark >= 0.3) {
      HP.charging = { shown: chipsText().indexOf('CHARGING') >= 0 };
      if (C.api && C.api.input) C.api.input.fire = false; // release fire
      C.charging = false;
      C.chargeT = 0;
      HP.stage = 9; HP.mark = HP.t;
    }
    return;
  }
  if (HP.stage === 9) {
    if (C.api && C.api.input) C.api.input.fire = false;
    C.charging = false;
    C.chargeT = 0;
    if (HP.t - HP.mark >= 0.3) {
      HP.charging.gone = chipsText().indexOf('CHARGING') < 0;
      const report = {
        hostiles: HP.hostiles,
        waveClear: HP.waveClear,
        critical: HP.critical,
        bracket: HP.bracket,
        charging: HP.charging,
      };
      window.__stage2.hudProbe = report;
      C.api.report({ hudProbe: report }); // parity — lands on __stage2.lastReport too
      HP.done = true;
    }
  }
}
