// STAGE TWO — stage-6 A1 AUDIO probe drive (the one-walk-per-file split precedent): this module
// owns ?audioProbe=1 and ?sfxFault=1 and NOTHING else. It is NOT a combat tick walk — the audio
// engine is exercised directly through audio.js's public surface, on a self-driving timer chain
// that waits for the harness's unlock gesture (the same once-listener contract real players hit).
// House rules hold: probes NEVER import combat.js — this module imports audio.js (+ sfx-pack.js
// transitively) only. The rider-B flag-gated-capture precedent: the data lives with the module
// that owns it (audio.js records the voice chains; this module publishes window.__stage2.audioProbe).
// What it walks (?audioProbe=1 — the audio-audit.md §4 verification contract):
//   every wired sample fired once → LAZY decode settles → status 'decoded' with byte evidence;
//   a 30-voice one-shot burst in one frame → the recorded peak must sit exactly at the cap;
//   one cued voice's chain dumped (must contain a StereoPannerNode);
//   the same cue at near (3 u) vs far (44 u) listener distance → far gain < near gain;
//   setMuted(true) → a fired cue must not change the voice count;
//   the sequencer note counter: advances monotonically → stalls while muted → resumes in phase
//   after unmute (the A1b scheduling contract, muted ⇒ no scheduling). The advance/resume
//   windows are a FULL bar (2.6 s ≥ 2.5 s) — the pattern seats 4-6 plucks per combat bar, so a
//   full-bar window is guaranteed to advance (no flake), while the reads use kind-tagged voice
//   records so live enemy fire can never contaminate the probe's near/far measurements.
// What it walks (?sfxFault=1): the forced per-sample decode failure — every sample must read
// status 'fallback' (the CONSOLE-SILENT synth fallback fired per cue; zero console noise is the
// page-level CONSOLE [] harness assert) and the phase must still land. A failed sample must
// NEVER log — the probe status field is the evidence, not audioLive() (the false-green class).
import * as AUDIO from './audio.js';

const qs = new URLSearchParams(location.search);
const AUDIO_PROBE = qs.get('audioProbe') === '1';
const SFX_FAULT = qs.get('sfxFault') === '1';

const R = {
  done: false, err: null,
  mode: SFX_FAULT ? 'sfxFault' : (AUDIO_PROBE ? 'audioProbe' : 'off'),
  samples: null, cap: null, capPeak: null, chain: null, near: null, far: null,
  mute: null, seq: null,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs) { // bounded — a stalled precondition records the timeout honestly, never hangs the drive
  const t0 = Date.now();
  for (;;) {
    try { if (fn()) return true; } catch { /* poll on */ }
    if (Date.now() - t0 > timeoutMs) return false;
    await sleep(150);
  }
}
const publish = () => { // window.__stage2 exists by the time the drive runs (post-unlock) — never at module eval
  if (window.__stage2) window.__stage2.audioProbe = R;
};

async function drive() {
  try {
    // the harness unlocks audio with a real CDP key event — the same first-gesture contract
    if (!(await waitFor(() => AUDIO.isAudioLive(), 20000))) { R.err = 'audio never unlocked'; return; }
    publish();
    if (!(await waitFor(() => !!AUDIO.listenerPos(), 10000))) { R.err = 'listener never set (combat not ticking)'; return; }

    // 1. fire every wired cue once — the LAZY decode kicks on first use (never at boot)
    const near = AUDIO.listenerPos();
    AUDIO.sfxLaser();
    AUDIO.sfxExplosion(near);
    AUDIO.sfxHit();
    AUDIO.sfxPickup();
    AUDIO.sfxEnemyFire(near);
    AUDIO.sfxUiClick(false);
    // wait for every sample's decode promise to settle ('decoded' | 'fallback' — never 'decoding')
    await waitFor(() => {
      const st = AUDIO.sampleStatus();
      return Object.keys(st).length > 0 && Object.keys(st).every((n) => st[n].status !== 'idle' && st[n].status !== 'decoding');
    }, 12000);
    R.samples = AUDIO.sampleStatus();
    if (SFX_FAULT) return; // the fault page's contract ends here: fallback per cue + phase lands

    // 2. voice cap: 30 one-shots in ONE frame — the cap refuses past 24, peak records the
    //    evidence. SHORT envelopes (20 ms): the burst must not still hold the cap when the
    //    near/far shots below fire (their onended releases land ~70 ms in).
    R.cap = AUDIO.voiceStats().cap;
    for (let i = 0; i < 30; i++) AUDIO.beep({ freq: 660, dur: 0.02, vol: 0.02 });
    R.capPeak = AUDIO.voiceStats().peak;
    await sleep(80); // clears the burst's release window AND the 50 ms explosion rate window stamped by the decode-trigger shot above

    // 3. chain dump + 4. distance attenuation — the same explosion cue near (3 u) vs far (44 u),
    //    read back by KIND so concurrent enemy fire can never contaminate the measurement
    AUDIO.sfxExplosion({ x: near.x + 3, y: near.y, z: near.z });
    await sleep(80);
    const nv = AUDIO.lastVoice('sample:explosion');
    R.chain = nv ? nv.chain : null;
    R.near = nv ? { pan: nv.pan, atten: nv.atten, gain: nv.gain } : null;
    AUDIO.sfxExplosion({ x: near.x + 44, y: near.y, z: near.z }); // > 50 ms shared rate limit apart
    await sleep(80);
    const fv = AUDIO.lastVoice('sample:explosion');
    R.far = fv ? { pan: fv.pan, atten: fv.atten, gain: fv.gain } : null;

    // 5. sequencer motion (A1b): advance over a FULL bar → muted stall → in-phase resume
    const seq = {};
    seq.a = AUDIO.seqStats().notes;
    await sleep(2600); // one 2.5 s bar — the combat pattern seats 4-6 plucks per bar, so b > a is guaranteed
    seq.b = AUDIO.seqStats().notes; // strictly greater while the combat bed's scheduler runs
    // 6. mute gates everything: no new VOICES while muted (the primitives early-return), and the
    //    sequencer STALLS (the tick no-ops) then snaps back in-phase on unmute
    AUDIO.setMuted(true);
    const vBefore = AUDIO.voiceStats().count;
    AUDIO.sfxExplosion({ x: near.x + 10, y: near.y, z: near.z });
    await sleep(60);
    const vAfter = AUDIO.voiceStats().count;
    R.mute = { before: vBefore, after: vAfter, unchanged: vBefore === vAfter };
    await sleep(1300);
    seq.mutedB = AUDIO.seqStats().notes; // === seq.b — nothing scheduled while muted
    AUDIO.setMuted(false);
    await sleep(2600); // a full bar after the unmute snap — the grid is back in phase
    seq.resumed = AUDIO.seqStats().notes; // strictly greater — the unmute snap resumed scheduling
    R.seq = seq;
  } catch (err) {
    R.err = String((err && err.message) || err); // probe-silent: the record is the evidence, never console noise
  } finally {
    R.done = true;
    publish();
  }
}

if (AUDIO_PROBE || SFX_FAULT) drive();
