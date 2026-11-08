// STAGE TWO — input. Story-011: the INPUT banner moved here verbatim from main.js, plus
// attachInput(), which registers exactly the same listeners in the same order at the same
// point of boot(). Shared state (probs, ui, the SPIN flag, the spin-viewer fix) arrives via
// the ONE context object main.js fills; setPhase comes from phases.js — never the reverse
// (combatApi's `input` handle is forwarded through the context, so no import cycle).
// Every listener only records, never interprets.
import { audioUnlock, audioSuspend, audioResume, setMuted, isMuted } from './audio.js';
import { refreshSoundButton } from './hud.js'; // rider D (2026-11-07): the M path refreshes the button label like the click path — hud.js imports only store.js + audio.js, so this edge is acyclic (dep-check proves it)
import * as COMBAT from './combat.js';
import * as TRANSITION from './transition.js';
import { nextNose, nextTop } from './ship-fix.js';
import { setPhase } from './phases.js';

let ctx = null;
export function initInput(context) { ctx = context; }

// shared input state — combat consumes it
export const input = { keys: new Set(), mouse: { x: 0, y: 0 }, mouseActive: false, fire: false, boost: false, px: { x: 0, y: 0 } };
export let paused = false;

function setPaused(p) {
  if (ctx.probs.phase !== 'combat') return;
  paused = p;
  // T1 (stage 6, polish-audit CRITICAL): pause does NOT change phase, so body.playing — and
  // its cursor:none — stays on while the pause card is up. The card now carries real pills,
  // so the OS cursor must return for exactly the pause window: body.paused wins the
  // !important cascade over body.playing * (higher specificity), and it clears on resume /
  // any phase change (phases.js setPhase removes it defensively).
  document.body.classList.toggle('paused', p);
  if (p) COMBAT.pauseCancelCharge(); // story-018 review fix: a pause WIPES the charge accumulator —
  // a release DURING the pause (the window pointerup still flips input.fire while tickCombat is
  // halted) must never fire the charged bolt on resume. Direction-flipped equivalent of the
  // suggested combat→input import, which is an import cycle (this module imports combat.js —
  // dep-check rule 1); combat.js keeps the state, input.js keeps the signal.
  if (ctx.ui.pause) ctx.ui.pause.hidden = !p;
  if (p) audioSuspend(); else audioResume(); // pause suspends the audio clock (spec #7)
}

function onKeydown(e) {
  input.keys.add(e.code);
  if (ctx.SPIN && ctx.probs.phase === 'title') { // closed viewer: N/T only — Enter can never launch
    if (e.code === 'KeyN') { Object.assign(ctx.activeFix, nextNose(ctx.activeFix.nose, ctx.activeFix.top)); ctx.applySpinFix(); }
    else if (e.code === 'KeyT') { Object.assign(ctx.activeFix, nextTop(ctx.activeFix.nose, ctx.activeFix.top)); ctx.applySpinFix(); }
    return;
  }
  if (ctx.probs.phase === 'combat') {
    if (COMBAT.combatState().dead) { // dying: only the card-skip listens — fire/pause stay dead (gofix 2026-11-03)
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); COMBAT.deathFastForward(); }
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); input.boost = true; } // Space = boost (rebind 2026-11-03); fire is LMB-only
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); setPaused(!paused); }
    if (e.code === 'KeyM') { setMuted(!isMuted()); refreshSoundButton(); } // rider D (2026-11-07, story-020 spec-review ruling): the KeyM path now refreshes the label IN-SESSION — pre-riders only the btn-sound click path (main.js) and the boot warm block did, so a muted session read "[ SOUND: ON ]" until reload
    return;
  }
  if (ctx.probs.phase === 'transition') { e.preventDefault(); TRANSITION.transitionSkip(); return; }
  if (ctx.probs.phase === 'gameover' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); setPhase('combat'); return; }
  if (ctx.probs.phase === 'title') {
    if (e.code === 'Escape') { e.preventDefault(); ctx.closePanel(); return; } // panels never trap the keyboard
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); onTitleAction('launch'); }
  }
}
function onKeyup(e) {
  input.keys.delete(e.code);
  if (e.code === 'Space') input.boost = false;
}
function onPointerMove(e) {
  input.px.x = e.clientX; input.px.y = e.clientY; // client px — combat pins #reticle here (the hidden cursor's stand-in)
  input.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  input.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  input.mouseActive = true;
}
function onPointerDown(e) {
  if (ctx.probs.phase === 'combat' && e.button === 0) input.fire = true;
}
function onPointerUp(e) {
  if (e.button === 0) input.fire = false;
}
function onPointerGone(e) { // full review R2-2: the cursor is hidden during play, so a stale
  if (e && e.relatedTarget) return; // pointer position would steer at full rate forever —
  input.mouseActive = false; // element-to-element crossings carry a relatedTarget; window exits don't
}
export function onTitleAction(kind) {
  if (ctx.SPIN) return; // closed viewer — a mis-oriented ship never reaches pad/combat
  audioUnlock(); // first gesture hands the context to the world (§8.3)
  if (kind === 'launch') setPhase('pad');
  else setPhase('combat'); // SKIP TO COMBAT is a real path since S4
}

// T1: the pause card's RESUME pill — the onTitleAction pattern (an exported action main.js
// wires; setPaused stays module-internal so the pause state keeps ONE owner). setPaused's own
// combat guard makes this a no-op outside combat, so a stale click can never land anywhere.
export function onPauseAction(kind) {
  if (kind === 'resume') setPaused(false);
}

/* ---------- listener attachment (story-011) ---------- */
// Called ONCE by the boot path, at the exact point where main.js used to register these
// listeners inline — same events, same targets, same order.
export function attachInput() {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('keyup', onKeyup);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointerout', onPointerGone); // cursor left the window (relatedTarget null) — full review R2-2
  window.addEventListener('blur', onPointerGone); // alt-tab: a stale pointer position is otherwise a permanent turn command
}
