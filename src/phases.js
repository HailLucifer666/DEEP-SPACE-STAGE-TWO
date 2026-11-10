// STAGE TWO — phase machine (exit-before-enter). Story-011: the PHASES banner moved here
// verbatim from main.js, together with the combat-phase ticks (tickCombat/tickSpdReadout and
// their spdAccum/lastSpd state): they are phase-shaped — combat.enter resets that state and
// the ticks exist solely to serve the combat phase (choice reported in the story-011 report).
// Shared state crosses the boundary through ONE context object (ctx) that main.js fills;
// scene/camera/rocket are exposed as getters there, so every hook reads the late-bound
// objects that boot() assigns. This module never imports main.js (no cycles) and never
// imports input.js — combatApi's `input` handle arrives through the context instead.
import * as LAUNCH from './launch.js';
import * as TRANSITION from './transition.js';
import * as COMBAT from './combat.js';
import { musicTo, victoryJingle } from './audio.js'; // stage-6 A1a: + the victory cue (a one-shot synth voice — NOT music)
import { readHighscore, writeHighscore } from './store.js';

let ctx = null;
export function initPhases(context) {
  ctx = context;
  RP.left = context.RESTART_N;
}

const fmtClock = (t) => { // story-014: the victory card's combat-clock readout — M:SS, never a raw float
  const s = Math.max(0, Math.floor(Number.isFinite(t) ? t : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const PHASES = {
  loading: { enter() { if (ctx.ui.title) ctx.ui.title.hidden = true; } },
  title: {
    enter() {
      musicTo('title'); // story-009: the pad owns title — deferred until audio unlock (spec §2)
      if (ctx.ui.loading) ctx.ui.loading.hidden = true;
      if (ctx.ui.title) { ctx.ui.title.hidden = false; ctx.refreshRecordLine(); }
      ctx.closePanel();
      ctx.disarmReset();
      ctx.refreshSoundButton();
      if (ctx.ui.hud) ctx.ui.hud.hidden = true;
    },
  },
  pad: {
    enter() {
      musicTo('title'); // story-009: the title bed carries through the launch phases (spec §2)
      COMBAT.clearCombat(); // death card REPLAY lands here — re-seat the rocket from the combat pose (§8.6)
      if (ctx.ui.gameover) ctx.ui.gameover.hidden = true; // setPhase is exit-before-enter: gameover.exit never runs on the way out
      ctx.ui.title.hidden = true; ctx.ui.hud.hidden = false; LAUNCH.enterPad(); TRANSITION.hudAssemble(false);
    },
  },
  countdown: { enter() { ctx.ui.hud.hidden = false; LAUNCH.enterCountdown(); } }, // sweep would orphan it — re-show (story-001)
  ignition: { enter() { ctx.ui.hud.hidden = false; LAUNCH.enterIgnition(); } },
  ascent: { enter() { ctx.ui.hud.hidden = false; LAUNCH.enterAscent(); } },
  transition: {
    enter() {
      musicTo('combat'); // story-009: warp crossfade starts — tension builds across the beat (spec §2)
      ctx.ui.hud.hidden = false; // numerals/tele/reticle live inside #hud — the sweep must not orphan it
      TRANSITION.enterTransition(ctx.scene, ctx.camera, ctx.rocket, ctx.ui, {
        go: (n) => setPhase(n),
        report: (r) => { ctx.probs.sub = r; window.__stage2.lastReport = r; },
      });
    },
  },
  combat: {
    enter() {
      TRANSITION.clearTransition(); // central teardown — skip-mid-beat leaves nothing behind
      ctx.probs.sub = null;
      window.__stage2.combatEntries = (window.__stage2.combatEntries || 0) + 1;
      if (ctx.ui.gameover) ctx.ui.gameover.hidden = true; // death-card SKIP lands here — same exit-before-enter gap as pad.enter
      LAUNCH.ambience(true); // vacuum: stars on, dawn off
      if (ctx.ui.hud) ctx.ui.hud.hidden = false; // gameover/title hide it; combat owns the bars
      TRANSITION.hudAssemble(true); // SKIRMISH lands without beat B2 — the reticle assembles on entry (story-001)
      COMBAT.enterCombat(ctx.scene, ctx.camera, ctx.rocket, ctx.ui, combatApi());
      spdAccum = 0; lastSpd = null; // story-010: ascent re-froze #tele with cruise telemetry — force one SPD rewrite
      musicTo('combat'); // story-009: SKIP path crossfade; idempotent — also rebuilds if teardown killed the bed (spec §2)
      if (ctx.RESTART_N && RP.left > 0) window.setTimeout(rpOnCombat, 700);
    },
    exit() { COMBAT.clearCombat(); }, // any exit drains pools — no spawn-during-restart (§8.6)
  },
  gameover: {
    enter() {
      musicTo('title'); // story-009: dawn crossfade under the death card (spec §2)
      ctx.game.timeScale = 1; // card reads in real time; restarts must never inherit slow-mo
      const finalScore = COMBAT.combatState().score;
      writeHighscore(Math.max(finalScore, readHighscore()));
      if (ctx.ui.goScore) ctx.ui.goScore.textContent = `SCORE — ${finalScore}`;
      if (ctx.ui.goHs) ctx.ui.goHs.textContent = `HIGH SCORE — ${readHighscore()}`;
      if (ctx.ui.hud) ctx.ui.hud.hidden = true;
      if (ctx.ui.gameover) ctx.ui.gameover.hidden = false;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (ctx.RESTART_N && RP.left > 0) window.setTimeout(rpOnGameover, 400);
    },
    exit() { if (ctx.ui.gameover) ctx.ui.gameover.hidden = true; },
  },
  // story-014: the win card — triggered by the bossDefeated signal (combat.js's bossApi.report
  // wrapper), mirrored on gameover's shape: title bed crossfade, real-time card, highscore
  // write, card up. Reads the victory state: final score + the per-fight combat clock
  // (combatState().time, M:SS) + REPLAY (same pad landing as the death card). No SKIP — the
  // fight is won, there is no shortcut past the win. NOT in PLAYING_PHASES: it is a card
  // phase, the cursor returns (the sweep hides the card on every phase change; enter
  // re-declares it).
  victory: {
    enter() {
      musicTo('title'); // story-009: the same dawn crossfade as gameover — the title bed lands under the win card (new music is out of scope)
      // stage-6 A1a (ORCHESTRATOR DECISION 2026-11-08 vs the story-014 freeze at this line):
      // the freeze bars new MUSIC under the card — the bed stays the same dawn crossfade. The
      // jingle below is a one-shot synth CUE riding that bed (≤ 0.22, the swell stays dominant),
      // not a music change. enter() runs once per landing, so no double-fire.
      victoryJingle();
      ctx.game.timeScale = 1; // the boss cinematic restored this already; parity with gameover — the card and any restart never inherit slow-mo
      const cs = COMBAT.combatState();
      const finalScore = cs.score;
      writeHighscore(Math.max(finalScore, readHighscore()));
      if (ctx.ui.vicScore) ctx.ui.vicScore.textContent = `SCORE — ${finalScore}`;
      if (ctx.ui.vicTime) ctx.ui.vicTime.textContent = `TIME — ${fmtClock(cs.time)}`;
      if (ctx.ui.hud) ctx.ui.hud.hidden = true;
      if (ctx.ui.victory) ctx.ui.victory.hidden = false;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      window.__stage2.victoryEntries = (window.__stage2.victoryEntries || 0) + 1; // exactly-once probe surface (mirrors combatEntries)
    },
    exit() { if (ctx.ui.victory) ctx.ui.victory.hidden = true; },
  },
};

export function setPhase(name) {
  const hook = PHASES[name];
  if (!hook) { console.error(`[stage2] unknown phase "${name}" — refused`); return false; } // §10: a phase always lands
  if (hook.exit) hook.exit();
  ctx.probs.phase = name;
  for (const elm of ctx.OVERLAY_ELMS) elm.hidden = true; // overlay sweep (story-001)
  document.body.classList.toggle('playing', PLAYING_PHASES.has(name)); // cursor:none rides the play phases
  document.body.classList.remove('paused'); // T1: .paused is the combat-pause window (input.js setPaused) — a phase change always leaves the pause state, so the cursor class can never strand across a sweep
  hook.enter?.();
  return true;
}
const PLAYING_PHASES = new Set(['pad', 'countdown', 'ignition', 'ascent', 'transition', 'combat']);

/* ---------- combat API + restart probe (?restartProbe=N) ---------- */
const RP = { left: 0, entries: [], ref: null }; // left initialized from ctx.RESTART_N in initPhases
function combatApi() {
  return {
    go: (n) => setPhase(n),
    report: (r) => { ctx.probs.sub = r; window.__stage2.lastReport = r; },
    input: ctx.input,
    setTimeScale: (v) => { ctx.game.timeScale = Number.isFinite(v) ? v : 1; },
    getTimeScale: () => ctx.game.timeScale,
  };
}
function rpOnCombat() { // fires 700 ms into a probed combat entry
  if (ctx.probs.phase !== 'combat') return;
  const cs = COMBAT.combatState();
  RP.entries.push({ hp: cs.hp, shield: cs.shield, score: cs.score, wave: cs.wave,
    particles: cs.particles, bolts: cs.bolts, entities: ctx.countMeshes() });
  if (!RP.ref) RP.ref = { entities: RP.entries[0].entities }; // run 1 only primes the lazy pools
  COMBAT.probeDamagePlayer(500); // forced death → slow-mo → gameover
}
function rpOnGameover() {
  if (ctx.probs.phase !== 'gameover') return;
  RP.left--;
  if (RP.left > 0) { setPhase('combat'); return; }
  const tail = RP.entries.slice(1);
  const clean = tail.length > 0 && tail.every((s) =>
    s.hp === 100 && s.shield === 50 && s.score === 0 && s.particles === 0 &&
    s.bolts === 0 && s.entities === RP.ref.entities);
  window.__stage2.restartProbe = { runs: RP.entries.length, left: RP.left, clean, entries: RP.entries };
  document.title = 'RESTART_PROBE ' + JSON.stringify({ runs: RP.entries.length, clean });
}

/* ---------- SPD readout (story-010) — the #tele block's combat writer ---------- */
// Cruise owns #tele (launch.js writes DIST/VEL/THR at 8 Hz); combat had no writer, so the
// frozen ascent telemetry just sat in the block through the whole fight. Same shape as
// cruise's writer: 8 Hz cadence, DOM write only when the rounded u/s changes (TD-009 —
// no per-frame textContent). Presentation only — the state lives in combatState().speed.
let spdAccum = 0, lastSpd = null;
function tickSpdReadout(dt) {
  if (!ctx.ui.tele) return;
  spdAccum += dt;
  if (spdAccum < 0.125) return;
  spdAccum = 0;
  const cs = COMBAT.combatState();
  const s = Math.round(typeof cs.velMag === "number" ? cs.velMag : cs.speed);
  if (s !== lastSpd) { ctx.ui.tele.textContent = `SPD ${s} u/s`; lastSpd = s; }
}
export function tickCombat(dt, t) { // combat core (combat.js) + the SPD line — phases owns #tele in this phase
  COMBAT.tickCombat(dt, t);
  tickSpdReadout(dt);
}
