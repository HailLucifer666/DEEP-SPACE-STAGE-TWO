// STAGE TWO — title-screen HUD: overlay map, title panels, record reset, toast. R-c (TD-003):
// the UI banner moved here VERBATIM from main.js (its 45-122 block, comments included) — a move,
// not a rewrite. Leaf module: imports ONLY store.js + audio.js; everything else (probs) arrives
// through the ONE ctx object (initHud) — it never imports main.js, phases.js, input.js or loop.js.
// Module body performs ZERO storage calls: readHighscore() only runs inside refreshRecordLine /
// onResetClick — the story-007 laziness contract holds (the pre-warm read returns 0; the warm
// call site stays in main.js boot()). T1: refreshRecordLine additionally gates the pre-warm
// paint behind storageWarm() — the initial paint is a placeholder, never a false 0
// (visual-audit F2-6; the warm re-render contract is untouched). The $ helper is re-declared here because the ui map needs
// it at eval time; main.js keeps its own one-line copy for boot() ($('scene-canvas')) — neither
// module imports the other.
import { readHighscore, writeHighscore, storageWarm } from './store.js';
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
  hudBars: $('hud-bars'), hudScore: $('hud-score'), reticle: $('reticle'), hudChips: $('hud-chips'), // story-018: the effect-chip line joins the ui map (combat owns the write)
  pipper: $('pipper'), lockBr: $('lock-bracket'), // stage-6 W1: pipper = bolt path, bracket = lock target (element-budget law — one meaning each; change-gated writers in aim-assist.js)
  bossBar: $('boss-bar'), waveBanner: $('wave-banner'), hitMark: $('hit-mark'), // stage-6 H1: boss HP bar (fed from BOSS.state() — the text line left #hud-bars), wave banner (#combat-online grammar), kill-only hit marker — change-gated writers in combat.js
  gameover: $('gameover'), goScore: $('go-score'), goHs: $('go-hs'), victory: $('victory'), vicScore: $('vic-score'),
  goReplay: $('go-replay'), goSkip: $('go-skip'), pause: $('pause'), vicTime: $('vic-time'), vicReplay: $('vic-replay'), // story-014 win card
  pauseResume: $('pause-resume'), pauseSound: $('pause-sound'), // T1: the pause card's pills (RESUME rides input.js's setPaused; SOUND mirrors btn-sound)
  btnControls: $('btn-controls'), btnReset: $('btn-reset'), btnSound: $('btn-sound'),
  btnCredits: $('btn-credits'), panel: $('panel'), panelTitle: $('panel-title'),
  panelBody: $('panel-body'), panelClose: $('panel-close'), tRec: $('t-rec'),
};

/* ---------- title panels + record reset (G) ---------- */
const PANEL_HTML = {
  CONTROLS:
    '<p><b>W / S</b> — throttle &amp; brake &nbsp;·&nbsp; <b>A / D</b> — turn left / right</p>' + '<p><b>R / F</b> or <b>MOUSE ↕</b> — pitch</p>' + // story-015: the pitch line lives in BOTH text places (panel + hint bar)
    '<p><b>MOUSE</b> — steer &nbsp;·&nbsp; <b>LMB</b> — fire guns &nbsp;·&nbsp; <b>SPACE / SHIFT</b> — boost</p>' +
    '<p><b>HOLD LMB</b> — charge shot (release to fire)</p>' + // story-018: the obvious-controls pillar — the second stage is a discovered extension of the same trigger
    '<p><b>T</b> — aim lock on/off (soft aim assist)</p>' + // stage-6 W1: the T control lands in BOTH text places (the forced rule — ux-audit F4); the hint bar carries the same line
    '<p><b>P / ESC</b> — pause &nbsp;·&nbsp; <b>M</b> — mute &nbsp;·&nbsp; <b>ENTER</b> — launch</p>' +
    '<p class="t-note">Drones ram. Shields regen after 3 clean seconds. The field flows faster while you boost. Downed enemies drop glowing pickups — fly through: SPREAD fan · OVERDRIVE rapid fire · SHIELD refill (8 s each, the HUD chips count down).</p>', // story-018: the pickups line
  CREDITS:
    '<p><b>MODELS</b> — hero ship + stage-one rocket made in <b>Vi3W</b> (app.vi3w.in)</p>' +
    '<p><b>FONTS</b> — Orbitron, Rajdhani (SIL OFL 1.1, Google Fonts)</p>' +
    '<p><b>SFX</b> — Kenney Sci-Fi Sounds (CC0 1.0) + procedural synth fallbacks</p>' +
    '<p><b>MUSIC</b> — procedural synth (pads + sequenced layer)</p>' +
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
  const label = `[ SOUND: ${isMuted() ? 'OFF' : 'ON'} ]`; // T1: one label, BOTH pills — the pause-card SOUND pill must live-refresh on every toggle path (rider-D rule)
  if (ui.btnSound) ui.btnSound.textContent = label;
  if (ui.pauseSound) ui.pauseSound.textContent = label;
}
function refreshRecordLine() {
  // T1 (visual-audit F2-6): the store is lazy (story-007) and readHighscore() returns 0 pre-warm
  // BY DESIGN — painting it shows a false RECORD 0 on any warm profile. A cold store holds the
  // em-dash placeholder until the warm callback (main.js boot) re-renders the real value; the
  // KEEP-PASSING contract (the warm re-render) is untouched, and a warm zero record still
  // reads 0 honestly (e.g. after [ RESET RECORD ]).
  const v = storageWarm() ? String(readHighscore()) : null;
  if (ui.hsLine) ui.hsLine.textContent = v === null ? 'HIGH SCORE —' : `HIGH SCORE — ${v}`;
  if (ui.tRec) ui.tRec.textContent = v === null ? 'RECORD —' : `RECORD ${v}`;
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
