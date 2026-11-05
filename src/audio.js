// STAGE TWO — synthesis engine. Every sound is math; zero asset files.
// Contract: nothing throws on a missing/suspended context (guard §8.3); looping
// nodes register in a set so phase exits can fade them (state-machine contract §10).
let AC = null;
let master = null;
let muted = false;
const runningLoops = new Set();

function getC() {
  return (AC && AC.state !== 'closed') ? AC : null;
}

function ensure() {
  if (AC) return getC();
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    const comp = AC.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(AC.destination);
    master.gain.value = muted ? 0 : 0.9;
  } catch (e) {
    console.warn('[stage2] WebAudio unavailable — running silent:', e && e.message);
    AC = null;
  }
  return getC();
}

export function audioUnlock() {
  const c = ensure();
  if (!c) return false;
  if (c.state === 'suspended') c.resume().catch(() => {}); // S2 plays only when running; no crash path
  musicFlush(); // story-009: a musicTo deferred before the context existed builds here (spec §2)
  return true;
}

export function isAudioLive() {
  const c = getC();
  return !!(c && c.state === 'running');
}

export function setMuted(m) {
  muted = !!m;
  const c = getC();
  if (c && master) master.gain.setTargetAtTime(muted ? 0 : 0.9, c.currentTime, 0.05);
  if (!muted) musicFlush(); // story-009: flush a musicTo that deferred while muted (spec §2)
}
export function isMuted() { return muted; }

// pause: freeze the audio clock (context suspend) — resumes without losing scheduled state
export function audioSuspend() {
  const c = getC();
  if (c && c.state === 'running') c.suspend().catch(() => {});
}
export function audioResume() {
  const c = getC();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0)); // §8.9 NaN hygiene

let _noise = null;
function noiseBuffer(c) {
  if (_noise) return _noise;
  const n = c.sampleRate * 2;
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02; // brownish walk
    d[i] = Math.max(-1, Math.min(1, last * 3.5));
  }
  _noise = buf;
  return buf;
}

// one-shot filtered noise burst — ignition, thuds, booms
export function noiseBurst({ dur = 0.6, vol = 0.5, f0 = 400, f1 = 900, type = 'lowpass', q = 1, delay = 0 } = {}) {
  const c = getC(); if (!c || muted) return null;
  const s = c.createBufferSource(); s.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime + clamp01(delay);
  f.frequency.setValueAtTime(Math.max(20, f0), t);
  f.frequency.linearRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(clamp01(vol), t + Math.min(0.08, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.05);
  return { s, g };
}

// short tone with decay envelope — countdown beeps, UI ticks
export function beep({ freq = 880, dur = 0.11, vol = 0.28, type = 'sine', delay = 0 } = {}) {
  const c = getC(); if (!c || muted) return null;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = Math.max(20, freq);
  o.connect(g); g.connect(master);
  const t = c.currentTime + clamp01(delay);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(clamp01(vol), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

// pitch sweep osc — laser/swoosh/etc. Returns osc for further ramps.
export function sweep({ f0 = 880, f1 = 220, dur = 0.18, vol = 0.3, type = 'square', delay = 0 } = {}) {
  const c = getC(); if (!c || muted) return null;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type;
  const t = c.currentTime + clamp01(delay);
  o.frequency.setValueAtTime(Math.max(20, f0), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(clamp01(vol), t + Math.min(0.02, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

// looping filtered noise with a handle — engine rumble / wind / deep-space bed
export function loopStart({ freq = 90, type = 'lowpass', q = 1.4, vol = 0.4, playback = 0.7 } = {}) {
  const c = getC(); if (!c) return null;
  const s = c.createBufferSource(); s.buffer = noiseBuffer(c); s.loop = true;
  s.playbackRate.value = Math.max(0.05, playback);
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = Math.max(20, freq); f.Q.value = q;
  const g = c.createGain(); g.gain.value = clamp01(vol);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(c.currentTime, Math.random() * 1.5);
  const bag = {
    s, f, g,
    alive: true,
    setFreq(hz) { if (this.alive && c.state !== 'closed') f.frequency.setTargetAtTime(Math.max(20, hz), c.currentTime, 0.2); },
    setVol(v) { if (this.alive && c.state !== 'closed') g.gain.setTargetAtTime(clamp01(v), c.currentTime, 0.15); },
    stop(fadeSec = 0.3) {
      if (!this.alive) return;
      this.alive = false;
      try {
        g.gain.setTargetAtTime(0.0001, c.currentTime, Math.max(0.01, fadeSec / 3));
        s.stop(c.currentTime + fadeSec + 0.1);
      } catch { /* already stopped — harmless */ }
      runningLoops.delete(this);
    },
  };
  runningLoops.add(bag);
  return bag;
}

export function loopsStopAll(fadeSec = 0.25) {
  for (const b of [...runningLoops]) b && b.stop && b.stop(fadeSec);
}

/* ---------- story-009: music bed + combat cues (spec: production/qa/evidence/story-009-music-sfx/sound-spec.md) ---------- */
// Music = persistent phase-owned pads built as bags on the loopStart contract (alive / music /
// setVol / stop), registered in runningLoops so the existing leak net still sees them. Teardown
// sites use musicEvict (spares music:true bags) — engine loops die on phase exits; the music is
// stopped ONLY by musicTo crossfades / its own stop(). Never schedules before unlock or while
// muted — deferred into musicWanted, flushed on audioUnlock / setMuted(false).

const musicBags = { title: null, combat: null }; // max one bag per name (spec §1)
let musicTarget = 'none'; // probe surface: current music target 'title' | 'combat' | 'none'
let musicWanted = null; // musicTo deferred by no-context / muted — flushed on unlock / unmute
const MUSIC_FAULT = new URLSearchParams(location.search).get('musicFault') === '1'; // TD-015 probe switch
let musicFaultFired = false;

// the spec's parameter-complete palette (§1 title pad, §2 combat variant)
const MUSIC_PADS = {
  title: {
    layers: [ // A2 open fifth — cold cyan drift over a barely-warm low root
      { type: 'sine', freq: 110, detune: 4, gain: 0.050 },
      { type: 'sine', freq: 165, detune: -4, gain: 0.035 },
      { type: 'triangle', freq: 220, detune: 7, gain: 0.020 },
    ],
    filter: { base: 900, q: 0.7, lfoHz: 0.05, lfoDepth: 250 }, // sweeps 650–1150 Hz, 20 s period
    air: { freq: 500, q: 0.8, playback: 0.35, gain: 0.012 },
    pulse: null,
  },
  combat: {
    layers: [ // same root, denser: A minor third + sub pulse — tension
      { type: 'sine', freq: 110, detune: 4, gain: 0.040 },
      { type: 'sine', freq: 130.81, detune: -4, gain: 0.028 },
      { type: 'sine', freq: 165, detune: 7, gain: 0.032 },
    ],
    filter: { base: 700, q: 1.1, lfoHz: 0.11, lfoDepth: 300 }, // sweeps 400–1000 Hz
    air: { freq: 320, q: 1.1, playback: 0.5, gain: 0.016 },
    pulse: { freq: 55, gain: 0.045, lfoHz: 0.8 }, // 55 Hz sine gated 0..1 at 0.8 Hz
  },
};

function makeMusicBag(c, kind) { // private: persistent oscs + per-layer gains + filter + LFO on the live context
  const pad = MUSIC_PADS[kind];
  const out = c.createGain(); out.gain.value = 0; // bag out-gain — setVol multiplier, entry from silence
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = pad.filter.base; filter.Q.value = pad.filter.q;
  filter.connect(out); out.connect(master);
  const nodes = []; // every started oscillator — stop() retires them together
  const flfo = c.createOscillator(); flfo.type = 'sine'; flfo.frequency.value = pad.filter.lfoHz;
  const fDepth = c.createGain(); fDepth.gain.value = pad.filter.lfoDepth;
  flfo.connect(fDepth); fDepth.connect(filter.frequency); flfo.start(); nodes.push(flfo); // osc → gain → frequency: zero per-frame JS
  for (const l of pad.layers) {
    const o = c.createOscillator(); o.type = l.type; o.frequency.value = l.freq; o.detune.value = l.detune;
    const g = c.createGain(); g.gain.value = l.gain; // the layer gains carry the absolute level
    o.connect(g); g.connect(filter); o.start(); nodes.push(o);
  }
  if (pad.pulse) { // sub pulse: base 0.5 gate ± LFO 0.5 → swings 0..1 (spec §2)
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = pad.pulse.freq;
    const gate = c.createGain(); gate.gain.value = 0.5;
    const plfo = c.createOscillator(); plfo.type = 'sine'; plfo.frequency.value = pad.pulse.lfoHz;
    const pDepth = c.createGain(); pDepth.gain.value = 0.5;
    const level = c.createGain(); level.gain.value = pad.pulse.gain;
    plfo.connect(pDepth); pDepth.connect(gate.gain);
    o.connect(gate); gate.connect(level); level.connect(filter);
    o.start(); plfo.start(); nodes.push(o, plfo);
  }
  // noise-air — a real loopStart bag (loopStart is filtered noise, not tonal), re-routed through
  // this bag's out-gain so crossfades and ducking own it; flagged music:true so musicEvict spares it
  const air = loopStart({ freq: pad.air.freq, type: 'bandpass', q: pad.air.q, playback: pad.air.playback, vol: pad.air.gain });
  if (air) {
    air.music = true;
    try { air.g.disconnect(); air.g.connect(out); } catch { /* re-route is best-effort — loopStart's own path still works */ }
  }
  const bag = {
    alive: true, music: true, kind,
    setVol(v, tau = 0.15) { // 0..1 multiplier on the bag out-gain — the loopStart bag contract
      if (!this.alive || c.state === 'closed') return;
      out.gain.setTargetAtTime(clamp01(v), c.currentTime, Math.max(0.01, tau));
    },
    stop(fadeSec = 0.3) { // the loopStart stop() pattern: tau = fadeSec/3, nodes stop at fadeSec+0.1
      if (!this.alive) return;
      this.alive = false;
      try {
        out.gain.setTargetAtTime(0.0001, c.currentTime, Math.max(0.01, fadeSec / 3));
        const end = c.currentTime + fadeSec + 0.1;
        for (const n of nodes) { try { n.stop(end); } catch { /* already stopped — harmless */ } }
      } catch { /* already stopped — harmless */ }
      if (air) air.stop(fadeSec);
      runningLoops.delete(this);
    },
  };
  runningLoops.add(bag); // the global leak net keeps seeing music (spec §1)
  return bag;
}

function crossfadeTo(name, c) { // OVERLAPPING crossfade — both beds run together, setTargetAtTime only (spec §2)
  // TD-015 (story-013): the bag-creation body is guarded — a WebAudio exception here runs
  // inside phase-enter hooks (phases.js) and must NEVER abort a transition. One warn line,
  // then the honest 'none' state. NOTE (stage-2 review, finding 4): "the dying bed was
  // already stopped" only holds for a makeMusicBag failure — a throw BEFORE the stop (the
  // fault probe, a setVol failure) leaves the dying bed sounding with a lost handle, so the
  // catch stops it best-effort (dyingBag hoisted for that; this catch must never throw).
  // ?musicFault=1 throws once inside the combat-bed build — the flow-check probe asserts
  // the warn, the 'none' state, and that the phase still lands.
  let dyingBag = null;
  try {
    if (MUSIC_FAULT && name === 'combat' && !musicFaultFired) {
      musicFaultFired = true;
      throw new Error('probe: forced music bag failure');
    }
    const other = name === 'title' ? 'combat' : 'title';
    const dying = musicBags[other];
    dyingBag = dying; // review (finding 4): visible to the catch — a pre-stop throw must not strand a sounding bed
    const overlap = !!(dying && dying.alive);
    if (overlap) {
      if (name === 'combat') { // title→combat: out tau 0.9, node stop at 2.9 s — overlap ≈ 2.5 s
        dying.setVol(0.0001, 0.9); dying.stop(2.8);
      } else { // combat→title (death→card): out tau 0.6, node stop at 1.9 s
        dying.setVol(0.0001, 0.6); dying.stop(1.8);
      }
      musicBags[other] = null;
    }
    const bag = makeMusicBag(c, name);
    musicBags[name] = bag;
    bag.setVol(1.0, name === 'title' && overlap ? 1.5 : 1.2); // ~4.5 s dawn under the death card, else the 1.2 s entry
  } catch (err) {
    console.warn('[stage2] music bed failed — running silent. reason:', err && (err.message || err));
    try { if (dyingBag && dyingBag.alive) dyingBag.stop(0.05); } catch {}
    musicTarget = 'none';
    musicBags.title = null;
    musicBags.combat = null;
  }
}

export function musicTo(name) { // idempotent phase-owned switch (spec §2)
  if (name !== 'title' && name !== 'combat') return;
  if (musicTarget === name && musicBags[name] && musicBags[name].alive) return; // already current + alive → no-op
  musicTarget = name;
  const c = getC();
  if (!c || muted) { musicWanted = name; return; } // never schedules before unlock or while muted — defer
  musicWanted = null;
  crossfadeTo(name, c);
}

function musicFlush() { // a deferred musicTo lands on audioUnlock / setMuted(false) (spec §2)
  const name = musicWanted;
  if (!name) return;
  const c = getC();
  if (!c || muted) return;
  musicWanted = null;
  if (musicTarget === name && musicBags[name] && musicBags[name].alive) return;
  crossfadeTo(name, c);
}

export function musicSetDuck(flow) { // boost ducks the combat bed — rides C.flow's own smoothing (spec §3)
  const bag = musicBags.combat;
  if (!bag || !bag.alive) return;
  const f = clamp01(flow);
  if (f <= 0.001) return; // idle: the entry swell (setVol(1.0, tau 1.2)) owns the ramp until boost moves flow
  bag.setVol(1 - 0.45 * f, 0.1); // full boost → multiplier 0.55
}

export function musicEvict(fadeSec = 0.25) { // loopsStopAll that spares music bags (spec §7)
  for (const b of [...runningLoops]) {
    if (b && b.music) continue;
    b && b.stop && b.stop(fadeSec);
  }
}

let alarmOn = false; // latched trigger: hp < 25 on, hp ≥ 35 re-arms off (hysteresis — no chatter)
let alarmT = 0;
export function alarmTick(dt, hp, dead) { // frame-gated accumulator — never setTimeout (spec §4)
  if (dead) { alarmOn = false; alarmT = 0; return; } // silent when dead; a retry re-arms via hp ≥ 35
  if (hp < 25) alarmOn = true;
  else if (hp >= 35) alarmOn = false;
  if (!alarmOn) { alarmT = 0; return; }
  alarmT -= dt;
  if (alarmT <= 0) { beep({ freq: 880, dur: 0.12, vol: 0.13, type: 'sine' }); alarmT = 0.9; }
}
export function alarmActive() { return alarmOn; } // probe surface (AC)

let proxT = 0;
export function proximityTick(dt, nearestDist) { // 300 Hz tick on a gated accumulator (spec §5)
  if (nearestDist == null || !Number.isFinite(nearestDist) || nearestDist >= 20) { proxT = 0; return; }
  const d = Math.max(5, nearestDist); // rate/vol clamp at 5 u
  const u = (20 - d) / 15; // 0 at 20 u → 1 at 5 u
  proxT -= dt;
  if (proxT <= 0) {
    beep({ freq: 300, dur: 0.06, vol: Math.min(0.05, 0.018 + u * 0.032), type: 'sine' });
    proxT = 1 / (0.7 + u * 1.5); // 0.7 Hz at 20 u → 2.2 Hz at 5 u
  }
}

export function musicState() { return musicTarget; } // probe getters (spec §7)
export function loopsCount() { return runningLoops.size; }

// atmosphere burns off → near-silence, then dies down (B1 vacuum moment)
export function vacuumDrop({ dur = 1.6, vol = 0.5 } = {}) {
  noiseBurst({ dur: dur * 0.55, vol, f0: 2400, f1: 140, type: 'lowpass', q: 0.8 });
  const c = getC(); if (!c || muted) return;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = 'sine';
  const t = c.currentTime;
  o.frequency.setValueAtTime(340, t);
  o.frequency.exponentialRampToValueAtTime(30, t + dur);
  g.gain.setValueAtTime(clamp01(vol * 0.5), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

/* ---------- story-018: charged shot + pickup cues (GDD §3.2; the audio-bag pattern — every
   recipe is math on the existing primitives, played from combat.js call sites; powerups.js
   stays sound-free by contract) ---------- */
export function chargeWhine() { // the rising whine AT the threshold crossing — the game announces the second stage (GDD §3.1: "the whine teaches the crossing")
  sweep({ f0: 240, f1: 1180, dur: 0.5, vol: 0.15, type: 'sawtooth' });
  beep({ freq: 740, dur: 0.4, vol: 0.05, type: 'sine', delay: 0.05 });
}
export function chargeRelease() { // the heavy thump when the charged bolt leaves
  noiseBurst({ dur: 0.32, vol: 0.5, f0: 1300, f1: 110 });
  beep({ freq: 140, dur: 0.22, vol: 0.22, type: 'triangle' });
}
export function pickupBlip() { // flying through a powerup — two-tone confirm
  beep({ freq: 660, dur: 0.09, vol: 0.18, type: 'square' });
  beep({ freq: 990, dur: 0.12, vol: 0.18, type: 'square', delay: 0.07 });
}
export function expireBlip() { // a timed effect runs out — softer, lower, unmistakably "over"
  beep({ freq: 300, dur: 0.16, vol: 0.12, type: 'sine' });
}
