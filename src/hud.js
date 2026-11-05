// STAGE TWO — title-screen HUD: overlay map, title panels, record reset, toast. R-c (TD-003):
// the UI banner moved here VERBATIM from main.js (its 45-122 block, comments included) — a move,
// not a rewrite. Leaf module: imports ONLY store.js + audio.js; everything else (probs) arrives
// through the ONE ctx object (initHud) — it never imports main.js, phases.js, input.js or loop.js.
// Module body performs ZERO storage calls: readHighscore() only runs inside refreshRecordLine /
// onResetClick — the story-007 laziness contract holds (the pre-warm read returns 0; the warm
// call site stays in main.js boot()). The $ helper is re-declared here because the ui map needs
// it at eval time; main.js keeps its own one-line copy for boot() ($('scene-canvas')) — neither
// module imports the other.
import { readHighscore, writeHighscore } from './store.js';
import { isMuted, setMuted } from './audio.js';

let probs = null; // boot/probe state — a const object whose identity never changes; set once via initHud
export function initHud(context) { probs = context.probs; }
/* ============================== UI ============================== */
const $ = (id) => document.getElementById(id);
const ui = {
  webglveil: $('webglveil'), loading: $('loading'), loadingNote: $('loading-note'),
  title: $('title'), hud: $('hud'), debug: $('debug'), toast: $('toast'),
  count: $('count'), tele: $('tele'), warn: $('warn'),
  hsLine: $('hs-line'), btnLaunch: $('btn-launch'), btnSkip: $('btn-skip'),
  hudBars: $('hud-bars'), hudScore: $('hud-score'), reticle: $('reticle'),
  gameover: $('gameover'), goScore: $('go-score'), goHs: $('go-hs'), victory: $('victory'), vicScore: $('vic-score'),
  goReplay: $('go-replay'), goSkip: $('go-skip'), pause: $('pause'), vicTime: $('vic-time'), vicReplay: $('vic-replay'), // story-014 win card
  btnControls: $('btn-controls'), btnReset: $('btn-reset'), btnSound: $('btn-sound'),
  btnCredits: $('btn-credits'), panel: $('panel'), panelTitle: $('panel-title'),
  panelBody: $('panel-body'), panelClose: $('panel-close'), tRec: $('t-rec'),
};

/* ---------- title panels + record reset (G) ---------- */
const PANEL_HTML = {
  CONTROLS:
    '<p><b>W / S</b> — throttle &amp; brake &nbsp;·&nbsp; <b>A / D</b> — turn left / right</p>' + '<p><b>R / F</b> or <b>MOUSE ↕</b> — pitch</p>' + // story-015: the pitch line lives in BOTH text places (panel + hint bar)
    '<p><b>MOUSE</b> — steer &nbsp;·&nbsp; <b>LMB</b> — fire guns &nbsp;·&nbsp; <b>SPACE / SHIFT</b> — boost</p>' +
    '<p><b>P / ESC</b> — pause &nbsp;·&nbsp; <b>M</b> — mute &nbsp;·&nbsp; <b>ENTER</b> — launch</p>' +
    '<p class="t-note">Drones ram. Shields regen after 3 clean seconds. The field flows faster while you boost.</p>',
  CREDITS:
    '<p><b>MODELS</b> — hero ship + stage-one rocket made in <b>Vi3W</b> (app.vi3w.in)</p>' +
    '<p><b>FONTS</b> — Orbitron, Rajdhani (SIL OFL 1.1, Google Fonts)</p>' +
    '<p><b>SFX / MUSIC</b> — procedural synth; Kenney CC0 pack pending handoff</p>' +
    '<p class="t-note">Full license log: CREDITS.md in the repo.</p>',
};
function openPanel(name) {
  if (probs.phase !== 'title') return;
  ui.panelTitle.textContent = name;
  ui.panelBody.innerHTML = PANEL_HTML[name] || '';
  ui.panel.hidden = false;
}
function closePanel() { if (ui.panel) ui.panel.hidden = true; }
function refreshSoundButton() {
  if (ui.btnSound) ui.btnSound.textContent = `[ SOUND: ${isMuted() ? 'OFF' : 'ON'} ]`;
}
function refreshRecordLine() {
  if (ui.hsLine) ui.hsLine.textContent = `HIGH SCORE — ${readHighscore()}`;
  if (ui.tRec) ui.tRec.textContent = `RECORD ${readHighscore()}`;
}
let resetArmT = 0;
function onResetClick() { // arm-then-confirm — the saved record is never destroyed by one stray click
  if (probs.phase !== 'title') return;
  if (!ui.btnReset.classList.contains('armed')) {
    ui.btnReset.classList.add('armed');
    ui.btnReset.textContent = '[ SURE? CLICK AGAIN ]';
    window.clearTimeout(resetArmT);
    resetArmT = window.setTimeout(disarmReset, 3200);
    return;
  }
  disarmReset();
  writeHighscore(0);
  refreshRecordLine();
  toast('RECORD CLEARED');
}
function disarmReset() {
  window.clearTimeout(resetArmT);
  if (!ui.btnReset) return;
  ui.btnReset.classList.remove('armed');
  ui.btnReset.textContent = '[ RESET RECORD ]';
}

// overlay policy (story-001): a phase change hides EVERY overlay; the entering phase
// re-declares what it shows. Kills the stuck-layer class at the root — no phase can
// leave a stale layer up (title-on-SKIRMISH, the old death-card hide gap, ...).
const OVERLAY_ELMS = [ui.title, ui.hud, ui.gameover, ui.victory, ui.pause, ui.loading, ui.warn,
  $('combat-online'), $('go-logo'), $('flash')].filter(Boolean);

let toastTimer = 0;
function toast(msg, ms = 2400) {
  if (!ui.toast) return;
  ui.toast.textContent = msg;
  ui.toast.classList.add('on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('on'), ms);
}

// exports consumed by main.js (composition root): the ctx WIRING line + boot()'s UI wiring
export { ui, openPanel, closePanel, refreshSoundButton, refreshRecordLine, onResetClick, disarmReset, OVERLAY_ELMS };
