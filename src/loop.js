// STAGE TWO — frame loop. Story-011: the LOOP banner moved here verbatim from main.js,
// together with the DPR auto-degrade block (a reported deviation from the move-table: it is
// consumed only by loop(), reads this module's fps meter as its primary input, and is
// adaptive-render policy rather than scene construction — colocating them removes a
// cross-module dependency). TICKS is built inside initLoop because its `title` entry depends
// on the SPIN boot flag, which arrives through the ONE context object main.js fills.
// `paused` is imported as a live binding from input.js (input.js never imports this module).
import * as LAUNCH from './launch.js';
import * as TRANSITION from './transition.js';
import { tickCombat } from './phases.js';
import { paused } from './input.js';

let ctx = null;
let TICKS = null;
export function initLoop(context) {
  ctx = context;
  TICKS = {
    title: ctx.SPIN ? tickSpin : tickTitle, // SHIP1: in SPIN nothing else writes camera/rocket
    pad: LAUNCH.tickPad,
    countdown: LAUNCH.tickCountdown,
    ignition: LAUNCH.tickIgnition,
    ascent: LAUNCH.tickAscent,
    transition: TRANSITION.tickTransition,
    combat: tickCombat,
  };
}
let last = 0, firstFrame = true;
export const fps = { times: [], read: 60 };

/* ---------- TD-013 (story-013): never-crash contract for the render path ----------
 * The composer render call is guarded: the FIRST render-time throw logs one line and
 * degrades to direct render PERMANENTLY (composerDead latches). probs.post stays honest:
 * 'bloom' = chain alive · 'off' = chain never built (boot guard) · 'direct' = built but
 * degraded at render time. ?composerFault=1 throws INSIDE the guarded call once — the
 * flow-check probe asserts the flip, the running game, and the single log line. */
const COMPOSER_FAULT = new URLSearchParams(location.search).get('composerFault') === '1';
let composerDead = false, composerFaultFired = false;
export const composerIsDead = () => composerDead; // review (finding 5): onResize guards the same latch setDpr guards
function renderFrame() {
  if (ctx.composer && !composerDead) {
    try {
      if (COMPOSER_FAULT && !composerFaultFired) {
        composerFaultFired = true;
        throw new Error('probe: forced composer render fault');
      }
      ctx.composer.render();
      return;
    } catch (err) {
      composerDead = true;
      ctx.probs.post = 'direct'; // the probe surface must reflect the degraded state
      console.error('[stage2] composer render threw — degrading to direct render permanently. reason:', err && (err.message || err));
    }
  }
  ctx.renderer.render(ctx.scene, ctx.camera);
}

function tickTitle(dt, t) {
  if (ctx.rocket) { ctx.rocket.rotation.y += dt * 0.45; } // gentle roll around the long axis; the rig owns the seat
  const a = 0.55 + t * 0.09; // orbit the rig — the ship sits nose-forward at the lane origin
  ctx.camera.position.set(Math.cos(a) * 5.6, 2.25 + Math.sin(t * 0.13) * 0.3, Math.sin(a) * 5.6);
  ctx.camera.lookAt(0, 1.35, 0); // look above the ship — it sinks into the lower third, clear of the title stack (story-008)
}

function tickSpin(dt, t) { // SHIP1: combat-view preview of the orientation under test
  if (!ctx.spinRig) return;
  ctx.spinRig.sway.rotation.y = 0.44 * Math.sin(t * 0.5); // ±25° yaw sway
  ctx.camera.position.set(0, 2.1, -4.6); // behind-and-above, engine side (-Z when nose is -Z)
  ctx.camera.lookAt(0, 0.4, 0);
}

export function loop(ts) {
  window.requestAnimationFrame(loop);
  if (firstFrame) { last = ts; firstFrame = false; ctx.mark('firstTick'); return; } // §8.1 first-frame skip
  let dt = (ts - last) / 1000;
  last = ts;
  if (!Number.isFinite(dt) || dt <= 0) dt = 0; // §8.9 NaN hygiene
  if (dt > ctx.DT_CLAMP) dt = ctx.DT_CLAMP;
  if (paused) { last = ts; renderFrame(); return; } // frozen frame, clock held — post chain still applies
  const sdt = dt * ctx.game.timeScale; // slow-mo scales the world, never the FPS meter
  ctx.game.time += sdt;
  TICKS[ctx.probs.phase]?.(sdt, ctx.game.time);
  updateFps(ts);
  dprTick(dt);
  ctx.updateDebug(dt, ts);
  renderFrame(); // story-008: post chain; TD-013: guarded — a render throw degrades to direct render permanently
}

function updateFps(ts) {
  fps.times.push(ts);
  while (fps.times.length > 2 && ts - fps.times[0] > 1000) fps.times.shift();
  if (fps.times.length > 1) fps.read = Math.round(((fps.times.length - 1) * 1000) / (ts - fps.times[0]));
}

/* ---------- DPR auto-degrade (feel: sustained slow frames step the buffer down) ---------- */
export const dprCtl = { cap: Math.min(window.devicePixelRatio || 1, 2), cur: Math.min(window.devicePixelRatio || 1, 2), lowT: 0, highT: 0 };
function setDpr(v) {
  dprCtl.cur = v;
  ctx.renderer.setPixelRatio(v);
  ctx.renderer.setSize(window.innerWidth, window.innerHeight); // buffer size must be reapplied after a ratio change
  // TD-013 residual (story-013 self-review flag): a latched-dead composer must never be
  // touched — setSize/setPixelRatio route through the same broken render path that threw.
  if (ctx.composer && !composerDead) { ctx.composer.setPixelRatio(v); ctx.composer.setSize(window.innerWidth, window.innerHeight); } // story-008: post chain follows the buffer
}
function dprTick(dt) { // raw dt (unscaled) — slow-mo must not fake slowness
  const f = fps.read;
  if (f < 45) { dprCtl.lowT += dt; dprCtl.highT = 0; }
  else if (f >= 50) { dprCtl.highT += dt; dprCtl.lowT = 0; }
  else { dprCtl.lowT = 0; dprCtl.highT = 0; } // hold in the 45–50 band — only SUSTAINED dips degrade
  if (dprCtl.lowT >= 2) { // degrade ladder — bloom is the cheap win, drop it before touching DPR (story-008)
    if (ctx.bloomPass && ctx.bloomPass.enabled) { ctx.bloomPass.enabled = false; dprCtl.lowT = 0; }
    else if (dprCtl.cur > 1) { setDpr(Math.max(1, +(dprCtl.cur - 0.5).toFixed(1))); dprCtl.lowT = 0; }
  } else if (dprCtl.highT >= 10) { // recovery ladder — bloom re-enables before DPR climbs back (story-008)
    if (ctx.bloomPass && !ctx.bloomPass.enabled) { ctx.bloomPass.enabled = true; dprCtl.highT = 0; }
    else if (dprCtl.cur < dprCtl.cap) { setDpr(Math.min(dprCtl.cap, +(dprCtl.cur + 0.5).toFixed(1))); dprCtl.highT = 0; }
  }
}
