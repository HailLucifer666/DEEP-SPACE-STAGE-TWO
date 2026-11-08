// STAGE TWO — music sequencer (stage-6 A1b): the sparse motion layer over the phase pads.
// Spec: production/polish/audio-audit.md §3 A1b — the pads are KEPT (design ruling: they are
// warm and in-key; a raw synth sequencer alone reads ringtone-cheap), this module adds ONE
// sparse pluck layer + hats-only percussion riding each music bag:
//   - Pluck voice: triangle osc → lowpass (cutoff = 4× note frequency, Q 2) → gain envelope
//     (5 ms attack, exponential decay to 0.0001 over 0.35 s) → pluck level → bag out-gain.
//   - Scale: A-minor pentatonic over the A2 root 110 Hz — cannot clash with either pad (the
//     combat pad's 130.81 Hz is a shared tone, not a clash).
//   - Grid: 96 BPM — bar = 2.5 s = exactly TWO of the combat pad's 1.25 s sub-gate periods, so
//     the pluck grid phase-locks to the existing 0.8 Hz LFO rhythm (both are born together in
//     makeMusicBag and free-run at crystal rate). 16 steps × 0.15625 s per bar.
//   - Density: title 2-3 notes/bar at level 0.045; combat 4-6 at 0.06 — the pad layers run
//     0.020-0.050, so plucks sit WELL under pad level.
//   - Variation: per loop, swap 1-2 seats in/out of the candidate pool (Math.random — music is
//     NOT under the deterministic-probe contract; the probe asserts only the note counter).
//   - Percussion: HATS ONLY — a short filtered-noise tick from the shared 2 s noise buffer
//     (bandpass 7 kHz Q 1, 2 ms attack / 50 ms decay), 8th-notes, accent ×1.4 on steps 0/8,
//     ~85% trigger density. NO kick/snare in v1 — synth drums against the 0.8 Hz sub-gate are
//     the classic cheap tell.
//   - Lookahead scheduling: ~0.2 s ahead on a ~100 ms timer against c.currentTime, so frame
//     jank cannot stutter the grid. Never schedules before audioUnlock (the scheduler is born
//     with the bag — makeMusicBag only runs post-unlock) or while muted: the tick no-ops while
//     muted and on unmute SNAPS nextStepTime = currentTime + 0.05 so the grid resumes in-phase
//     rather than stampeding. Pause (context suspend) freezes c.currentTime, so the scheduler
//     naturally starves and resumes seamlessly.
// Contract: every node connects through the CALLER's out-gain (the bag out-gain), so
// crossfades and musicSetDuck own the plucks and hats exactly as they own the pads; stop()
// retires the timer together with the bag. The note counter counts scheduled plucks (the
// probe surface — a removed step advance freezes the seat at 0, which carries no pluck, so a
// stalled counter is the detectable mutation signature; the hats keep the page audible).
// Pure WebAudio — imports nothing (noise buffer + mute state arrive as parameters).

const STEP = 0.15625;      // 96 BPM 16th — bar = 2.5 s
const LOOKAHEAD = 0.2;     // s scheduled ahead of c.currentTime
const TICK_MS = 100;       // scheduler period — ≤ half the lookahead, jank-tolerant
const SCALE = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392]; // A-minor pentatonic, A2 root
const CANDIDATES = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15]; // pluck seats — NEVER 0 (the mutation probe: a frozen step seat reads no pluck)
const HAT_EVERY = 2;       // 8th-notes
const HAT_DENSITY = 0.85;  // ~85% trigger rate
const ACCENT = 1.4;        // steps 0/8

export function createSequencer(c, out, kind, noiseBuf, isMuted) {
  const combat = kind === 'combat';
  const pluckSeats = () => { // how many plucks this bar wants
    const n = combat ? 4 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 2);
    return n; // combat 4-6, title 2-3
  };
  let pattern = []; // 16 booleans — which seats carry a pluck this loop
  const varyPattern = () => { // per-loop variation: re-seat within the candidate pool (1-2 swaps)
    const want = pluckSeats();
    const seats = new Set();
    while (seats.size < want) seats.add(CANDIDATES[Math.floor(Math.random() * CANDIDATES.length)]);
    const next = new Array(16).fill(false);
    for (const s of seats) next[s] = true;
    if (pattern.length) { // swap 1-2 kept seats for fresh ones — subtle, never a full rewrite
      const swaps = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < swaps; i++) {
        const off = CANDIDATES[Math.floor(Math.random() * CANDIDATES.length)];
        const on = CANDIDATES[Math.floor(Math.random() * CANDIDATES.length)];
        if (next[on] && !next[off] && Math.random() < 0.5) { next[on] = false; next[off] = true; }
      }
    }
    pattern = next;
  };
  varyPattern();

  // sub-buses: the levels carry the absolute density figures (§3 A1b) — note envelopes peak at 1
  const pluckBus = c.createGain(); pluckBus.gain.value = combat ? 0.06 : 0.045; pluckBus.connect(out);
  const hatBus = c.createGain(); hatBus.gain.value = combat ? 0.028 : 0.018; hatBus.connect(out);

  const notes = { count: 0 }; // the probe surface — scheduled plucks, monotonic while running

  function pluck(t) {
    const freq = SCALE[Math.floor(Math.random() * SCALE.length)];
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.min(12000, freq * 4); f.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.005); // 5 ms attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); // short decay — the pluck reads, the pad owns the sustain
    o.connect(f); f.connect(g); g.connect(pluckBus);
    o.start(t); o.stop(t + 0.4);
    notes.count++;
  }
  function hat(t, accent) {
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 7000; f.Q.value = 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(accent ? ACCENT : 1, t + 0.002); // 2 ms attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); // 50 ms decay
    s.connect(f); f.connect(g); g.connect(hatBus);
    const dur = 0.07;
    s.start(t, Math.random() * 1.5, dur); s.stop(t + dur);
  }
  function scheduleStep(step, t) {
    if ((step % HAT_EVERY) === 0 && Math.random() < HAT_DENSITY) hat(t, step === 0 || step === 8);
    if (pattern[step]) pluck(t);
  }

  let step = 0;
  let nextStepTime = c.currentTime + 0.1; // born slightly ahead — the first bar locks to the pad LFO phase
  let starved = false; // muted (or suspended) since the last tick — snap forward on the next live tick
  let alive = true;
  const tick = () => {
    if (!alive || c.state === 'closed') { stopTimer(); return; }
    if (c.state !== 'running') return; // pause: c.currentTime is frozen — the grid starves and resumes seamlessly
    if (isMuted()) { starved = true; return; } // never schedule while muted
    if (starved) { starved = false; nextStepTime = Math.max(nextStepTime, c.currentTime + 0.05); } // unmute snap — in-phase, not stampeding
    while (nextStepTime < c.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextStepTime);
      nextStepTime += STEP;
      step = step + 1; // MUTATION TARGET (stage-6 A1b): removing this advance freezes the seat at 0 — the note counter stalls (flow-check A1 probe RED)
      if (step >= 16) { step = 0; varyPattern(); }
    }
  };
  const timer = setInterval(tick, TICK_MS);
  function stopTimer() { if (timer) { clearInterval(timer); } }
  return {
    notes: () => notes.count,
    stop() { alive = false; stopTimer(); },
  };
}
