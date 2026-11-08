// STAGE TWO — synthesis engine. Every VOICE is math; the SFX one-shots are Kenney CC0 samples
// (src/sfx-pack.js, stage-6 A1a) with math fallbacks — music stays procedural by design.
// Contract: nothing throws on a missing/suspended context (guard §8.3); looping
// nodes register in a set so phase exits can fade them (state-machine contract §10).
// story-020: the mute choice persists through the guarded store — audio.js imports store.js
// (store is self-contained, zero imports: audio→store is acyclic, dep-check verifies).
// stage-6 A1a (spec: production/polish/audio-audit.md — every number there is binding):
// sfx/music buses hang BETWEEN the voices and master (mute stays on master.gain —
// setMuted/restoreMuted bodies are untouched, everything below inherits the mute); the
// DynamicsCompressor is configured deliberately (−18 dB / 4:1 / 0.25 s) instead of the
// accidental DEFAULTS limiter; every one-shot chain ends gain → StereoPannerNode → sfx bus
// with pan = clamp(xRel/30, ±0.8) and attenuation 1.0 at ≤ 5 u → 0.2 floor at 45 u; a 24-voice
// cap + per-event rate limits refuse (never queue) bursts; audio.sample() plays the CC0
// samples lazily-decoded with ±5% pitch jitter and a CONSOLE-SILENT synth fallback whose
// status is probe-visible (a failing sample must NEVER log — the harness gates every page on
// zero console warnings).
import { writeMuted } from './store.js';
import { SFX_PACK } from './sfx-pack.js';
import { createSequencer } from './music-seq.js';
let AC = null;
let master = null;
let sfxBus = null; // stage-6 A1a: one-shot voices → StereoPanner → here → master
let musicBus = null; // stage-6 A1a: the music bags' out-gains → here → master (crossfades/duck own the bags)
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
    // stage-6 A1a: configured deliberately — threshold −18 dB, ratio 4:1, release 0.25 s
    // (knee/attack stay at defaults 30/3 ms). Replaces the shipped DEFAULTS-configured
    // −24 dB / 12:1 limiter that pumped on stacked bursts (audio-audit gap 6).
    comp.threshold.value = -18; comp.ratio.value = 4; comp.release.value = 0.25;
    master.connect(comp);
    comp.connect(AC.destination);
    sfxBus = AC.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    musicBus = AC.createGain(); musicBus.gain.value = 1; musicBus.connect(master);
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
  writeMuted(muted); // story-020: the single write choke point — the M key (input.js) and the sound
  // button (main.js) both funnel through setMuted, so both persist with zero call-site changes
  const c = getC();
  if (c && master) master.gain.setTargetAtTime(muted ? 0 : 0.9, c.currentTime, 0.05);
  if (!muted) musicFlush(); // story-009: flush a musicTo that deferred while muted (spec §2)
}
export function isMuted() { return muted; }
export function restoreMuted(m) { // story-020: boot applies the STORED value WITHOUT writing — the
  // warm restore must not rewrite what it just read (one explicit export, one job). No musicFlush:
  // a flush here could only defer again pre-unlock, and audioUnlock's own musicFlush covers the
  // gesture path. The `c && master` branch is the gesture-beat-the-warm-block fallback — a gesture
  // during GLB load creates the context unmuted before this runs; without it the flag would say
  // muted while the gain stayed 0.9. In the normal order ensure() reads `muted` when the context
  // is first built, so a persisted-muted boot comes up silent at the master gain.
  muted = !!m;
  const c = getC();
  if (c && master) master.gain.setTargetAtTime(muted ? 0 : 0.9, c.currentTime, 0.05);
}

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

/* ---------- stage-6 A1a: voice cap, spatialization, buses, rate limits ---------- */

const VOICE_CAP = 24; // simultaneous one-shot voices; at cap the NEW trigger is refused (return
// null — newest-dropped keeps ongoing feedback like the alarm ticking). Loops/bags are not capped.
let voiceCount = 0;
let voicePeak = 0; // probe surface — the recorded peak must sit exactly at the cap under a burst
function voiceBegin() {
  if (voiceCount >= VOICE_CAP) return false;
  voiceCount++;
  if (voiceCount > voicePeak) voicePeak = voiceCount;
  return true;
}
function voiceRelease() { voiceCount--; } // decrements on the source's onended (audio-audit §3)

const LISTENER = { x: 0, y: 0, z: 0, set: false }; // the ship's live position — fed once per frame
export function setListener(p) { // additive audio hook (combat.js's audio block) — never gameplay logic
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
  LISTENER.x = p.x; LISTENER.y = p.y; LISTENER.z = p.z; LISTENER.set = true;
}
export function listenerPos() { return LISTENER.set ? { x: LISTENER.x, y: LISTENER.y, z: LISTENER.z } : null; }

// pan = clamp(xRel / 30, −0.8, 0.8) where xRel is the source x minus the ship x (world units);
// attenuation gain = 1.0 at d ≤ 5 u, linear down to a 0.2 floor at 45 u — far events never
// vanish. Returns null for dead-center full-level voices (no source position / no listener):
// UI and master voices stay centered (audio-audit §3).
function spatial(pos) {
  if (!pos || !LISTENER.set) return null;
  const xRel = pos.x - LISTENER.x, dy = pos.y - LISTENER.y, dz = pos.z - LISTENER.z;
  const d = Math.sqrt(xRel * xRel + dy * dy + dz * dz);
  return { pan: Math.max(-0.8, Math.min(0.8, xRel / 30)), atten: d <= 5 ? 1 : Math.max(0.2, 1 - (d - 5) * 0.02) };
}

// every one-shot chain ends gain → StereoPannerNode → sfx bus. The probe ring keeps the last
// few voices' node types + spatial result — the ?audioProbe assertions read them (chain dump,
// near/far attenuation), kind-tagged so live combat can never contaminate a probe measurement.
const VOICE_RING = [];
function voiceOut(g, sp, peak, kind) {
  const p = AC.createStereoPanner();
  p.pan.value = sp ? sp.pan : 0;
  g.connect(p); p.connect(sfxBus);
  VOICE_RING.push({ kind, chain: [g.constructor.name, p.constructor.name], pan: sp ? sp.pan : 0, atten: sp ? sp.atten : 1, gain: peak, t: AC.currentTime });
  if (VOICE_RING.length > 8) VOICE_RING.shift();
  return p;
}
export function lastVoice(kind) { // the most recent voice (optionally of one kind) — probe surface
  for (let i = VOICE_RING.length - 1; i >= 0; i--) if (!kind || VOICE_RING[i].kind === kind) return VOICE_RING[i];
  return null;
}
export function voiceStats() { return { count: voiceCount, peak: voicePeak, cap: VOICE_CAP }; }

const rateLast = {}; // per-event rate limits — an ATTEMPT stamps the window (burst suppression,
// not per-shooter silence; audio-audit §3): explosion 50 ms, hit 40 ms, enemy-fire 50 ms
// SHARED across gunners + boss volley, UI 30 ms. Player laser/alarm/proximity keep their
// existing drivers (fire rate; frame-gated accumulators).
function rateOk(key, ms) {
  const now = performance.now();
  if (rateLast[key] != null && now - rateLast[key] < ms) return false;
  rateLast[key] = now;
  return true;
}

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
export function noiseBurst({ dur = 0.6, vol = 0.5, f0 = 400, f1 = 900, type = 'lowpass', q = 1, delay = 0, pos = null } = {}) {
  const c = getC(); if (!c || muted) return null;
  if (!voiceBegin()) return null; // voice cap — refuse, never queue
  const sp = spatial(pos);
  const peak = clamp01(vol) * (sp ? sp.atten : 1);
  const s = c.createBufferSource(); s.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime + clamp01(delay);
  f.frequency.setValueAtTime(Math.max(20, f0), t);
  f.frequency.linearRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + Math.min(0.08, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); voiceOut(g, sp, peak, 'noise');
  s.onended = voiceRelease;
  s.start(t); s.stop(t + dur + 0.05);
  return { s, g };
}

// short tone with decay envelope — countdown beeps, UI ticks
export function beep({ freq = 880, dur = 0.11, vol = 0.28, type = 'sine', delay = 0, pos = null } = {}) {
  const c = getC(); if (!c || muted) return null;
  if (!voiceBegin()) return null;
  const sp = spatial(pos);
  const peak = clamp01(vol) * (sp ? sp.atten : 1);
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = Math.max(20, freq);
  o.connect(g); voiceOut(g, sp, peak, 'beep');
  const t = c.currentTime + clamp01(delay);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.onended = voiceRelease;
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

// pitch sweep osc — laser/swoosh/etc. Returns osc for further ramps.
export function sweep({ f0 = 880, f1 = 220, dur = 0.18, vol = 0.3, type = 'square', delay = 0, pos = null } = {}) {
  const c = getC(); if (!c || muted) return null;
  if (!voiceBegin()) return null;
  const sp = spatial(pos);
  const peak = clamp01(vol) * (sp ? sp.atten : 1);
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type;
  const t = c.currentTime + clamp01(delay);
  o.frequency.setValueAtTime(Math.max(20, f0), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + Math.min(0.02, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); voiceOut(g, sp, peak, 'sweep');
  o.onended = voiceRelease;
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
  const p = c.createStereoPanner(); // loops ride the same bus shape (centered — loops carry no source position)
  s.connect(f); f.connect(g); g.connect(p); p.connect(sfxBus);
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
// stage-6 A1b: each bag now carries the sparse sequencer (src/music-seq.js) riding the bag
// out-gain — crossfades and musicSetDuck own the plucks and hats exactly as they own the pads,
// and bag.stop() retires the scheduler timer together with the nodes.

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
  filter.connect(out); out.connect(musicBus); // stage-6 A1a: the bus hangs between the bags and master
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
  // stage-6 A1b: the sparse sequencer rides the bag out-gain. The TD-015 (?musicFault=1)
  // injection lives IN THIS BUILD PATH — moved from the old pad-build position (audio-audit §3
  // A1a "load-bearing"): still name === 'combat', still once via the latch, still INSIDE
  // crossfadeTo's try (this whole function is its call site). A throw here self-cleans the
  // partial bag (silent out-gain, nodes stopped, air bag retired) and RETHROWS into
  // crossfadeTo's catch — whose contract below stays VERBATIM.
  let seq = null;
  try {
    if (MUSIC_FAULT && kind === 'combat' && !musicFaultFired) {
      musicFaultFired = true;
      throw new Error('probe: forced music bag failure');
    }
    seq = createSequencer(c, out, kind, noiseBuffer(c), () => muted); // born with the bag — never pre-unlock
  } catch (err) {
    try {
      out.gain.setTargetAtTime(0.0001, c.currentTime, 0.02);
      for (const n of nodes) { try { n.stop(); } catch { /* already stopped — harmless */ } }
      if (air) air.stop(0.05);
    } catch { /* nothing left to clean — harmless */ }
    throw err;
  }
  const bag = {
    alive: true, music: true, kind,
    seq, // the A1b motion layer — seqStats() reads its note counter
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
      if (seq) seq.stop(); // A1b: the scheduler timer retires with the nodes
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
  // ?musicFault=1 throws once inside the combat bed's SEQUENCER build (stage-6 A1b moved it
  // there from the old pad-build position — the probe must exercise the new build shape);
  // the flow-check probe asserts the warn, the 'none' state, and that the phase still lands.
  let dyingBag = null;
  try {
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

export function seqStats() { // stage-6 A1b probe surface — the sequencers' note counters
  let notes = 0, running = 0;
  const kinds = [];
  for (const k of ['title', 'combat']) {
    const b = musicBags[k];
    if (b && b.alive && b.seq) { running++; kinds.push(k); notes += b.seq.notes(); }
  }
  return { notes, running, kinds };
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
  if (!voiceBegin()) return; // voice cap — the burst half already fired; the drop half refuses politely
  const o = c.createOscillator(); const g = c.createGain();
  o.type = 'sine';
  const t = c.currentTime;
  o.frequency.setValueAtTime(340, t);
  o.frequency.exponentialRampToValueAtTime(30, t + dur);
  g.gain.setValueAtTime(clamp01(vol * 0.5), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); voiceOut(g, null, clamp01(vol * 0.5), 'vacuum');
  o.onended = voiceRelease;
  o.start(t); o.stop(t + dur + 0.05);
}

/* ---------- stage-6 A1a: the sample path — LAZY decode, ±5% pitch jitter, round-robin,
   CONSOLE-SILENT synth fallback with probe-visible status (audio-audit §3). Decode happens on
   FIRST USE per sample (never at module eval, never in the boot window); the decode PROMISE is
   memoized so concurrent first-plays share one decode. A failed/stalled decode plays the
   binding synth recipe and sets the probe-visible status — a failing sample must NEVER log. ---------- */
const SFX_FAULT = new URLSearchParams(location.search).get('sfxFault') === '1'; // ?sfxFault=1 probe switch
const sampleState = {}; // name → { status: 'idle'|'decoding'|'decoded'|'fallback', caches }

function recomputeStatus(st) {
  if (st.caches.every((x) => x.ok)) st.status = 'decoded';
  else if (st.caches.some((x) => x.failed)) st.status = 'fallback';
  else st.status = 'decoding';
}
function dataUrlBytes(url) { // data:audio/ogg;base64,… → Uint8Array — a SYNCHRONOUS base64 decode
  // (atob) of a 7-48 KB payload: microseconds. fetch(data:) would work but drags the Response
  // machinery onto whatever frame happens to be the sample's FIRST USE — for the laser that is
  // a mid-combat fire frame, and the harness's OVERDRIVE interval band measures exactly such
  // frames. Same lazy contract (first use, memoized promise), less first-use main-thread cost.
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function decodeOne(c, url) {
  if (SFX_FAULT) throw new Error('probe: forced sfx decode failure'); // console-silent by contract
  const bytes = dataUrlBytes(url);
  const size = bytes.byteLength; // captured BEFORE decodeAudioData — it DETACHES the buffer
  const buf = await c.decodeAudioData(bytes.buffer); // data URLs decode offline — file:// safe
  return { buf, bytes: size };
}
function ensureDecoded(name, c) {
  const st = sampleState[name];
  for (const cache of st.caches) {
    if (cache.promise) continue;
    cache.promise = decodeOne(c, cache.url).then((r) => {
      cache.buf = r.buf; cache.bytes = r.bytes; cache.ok = true;
      recomputeStatus(st);
    }, () => {
      cache.failed = true; // the status IS the evidence — never a console line
      recomputeStatus(st);
    });
    cache.promise.catch(() => {}); // never an unhandled rejection (the harness gates on zero console noise)
  }
  recomputeStatus(st);
}
function playBuf(c, buf, pos, vol, name) { // one sample voice — cap-subject like every one-shot
  if (!voiceBegin()) return true; // at cap refuse — the fallback must not dodge the cap either
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 1 + (Math.random() * 0.1 - 0.05); // ±5% pitch jitter per play (plan-of-record)
  const g = c.createGain();
  g.gain.value = clamp01(vol);
  src.connect(g);
  const sp = spatial(pos);
  voiceOut(g, sp, clamp01(vol) * (sp ? sp.atten : 1), 'sample:' + name); // kind-tagged — the probe reads by kind, live combat can never contaminate a measurement
  src.onended = voiceRelease;
  try { src.start(); } catch { voiceRelease(); }
  return true;
}
export function sample(name, { pos = null, vol = 1, fallback = null } = {}) { // audio.sample(name, opts) — the spec's surface
  const c = getC();
  if (!c || muted) return null;
  const def = SFX_PACK[name];
  if (!def) return null;
  if (!sampleState[name]) {
    sampleState[name] = { status: 'idle', caches: def.urls.map((url) => ({ url, promise: null, buf: null, bytes: 0, ok: false, failed: false })) };
  }
  ensureDecoded(name, c); // lazy: first use kicks the decode, out of the boot window
  const st = sampleState[name];
  if (st.status === 'decoded') {
    const cache = st.caches[def.rr % st.caches.length]; // round-robin over same-family variants
    def.rr++;
    if (cache && cache.buf && playBuf(c, cache.buf, pos, vol, name)) return 'sample';
  }
  if (fallback) fallback(); // CONSOLE-SILENT synth fallback — the binding recipe from the call site
  return 'fallback';
}
export function sampleStatus() { // probe surface — the sample-path truth (NOT audioLive(), the false-green class)
  const out = {};
  for (const name of Object.keys(SFX_PACK)) {
    const st = sampleState[name];
    out[name] = st
      ? { status: st.status, files: st.caches.map((x) => ({ bytes: x.bytes, ok: x.ok })) }
      : { status: 'idle', files: [] };
  }
  return out;
}

/* ---------- stage-6 A1a: named voices — sample when decoded, the audio-audit §3 wiring map's
   binding synth recipe as the CONSOLE-SILENT fallback. Call sites stay additive one-liners. ---------- */
export function sfxLaser() { // the player's stream shot — one per SHOT (a fan is one shot); the shipped sweep params live on as the fallback
  sample('laser', { fallback: () => sweep({ f0: 1500, f1: 320, dur: 0.09, vol: 0.12, type: 'square' }) });
}
export function sfxExplosion(pos, opts = {}) { // kills + boss hits — 50 ms shared rate limit
  if (!rateOk('explosion', 50)) return;
  sample('explosion', { pos, fallback: () => noiseBurst(opts.heavy // the boss-node variant keeps its heavier shipped params
    ? { dur: 0.3, vol: 0.5, f0: 1200, f1: 140 }
    : { dur: 0.28, vol: 0.4, f0: 900, f1: 140 }) });
}
export function sfxHit() { // player hurt (all four damagePlayer sources) — 40 ms rate limit
  if (!rateOk('hit', 40)) return;
  sample('hit', { fallback: () => { // the audit's binding impact recipe
    noiseBurst({ dur: 0.18, vol: 0.3, f0: 1800, f1: 300 });
    beep({ freq: 200, dur: 0.12, vol: 0.15, type: 'triangle' });
  } });
}
export function sfxPickup() { // powerup collect — the shipped pickupBlip stays as the fallback (verbatim)
  sample('pickup', { fallback: pickupBlip });
}
export function sfxEnemyFire(pos) { // gunner bolts + the boss volley — ONE enemy-fire timbre, 50 ms SHARED limit
  if (!rateOk('efire', 50)) return;
  sample('efire', { pos, fallback: () => sweep({ f0: 520, f1: 140, dur: 0.14, vol: 0.12, type: 'square' }) });
}
export function sfxUiClick(commit = false) { // every button — title, pause pills, panels, end cards; 30 ms rate limit
  if (!rateOk('ui', 30)) return;
  sample('ui', { fallback: () => { // the audit's binding UI recipe; the LAUNCH commit adds the two-tone
    beep({ freq: 1200, dur: 0.04, vol: 0.1, type: 'square' });
    if (commit) beep({ freq: 1800, dur: 0.06, vol: 0.1, type: 'square', delay: 0.05 });
  } });
}
export function bossStinger(pos) { // the boss's arrival — fires ONLY on the natural spawn path (spawnForProbe stays silent — probe determinism); ≈ 1.0 s total, the 55 Hz sub ties it to the combat bed's root
  sweep({ f0: 90, f1: 320, dur: 0.9, vol: 0.22, type: 'sawtooth', pos });
  beep({ freq: 55, dur: 0.7, vol: 0.3, type: 'sine', pos });
  noiseBurst({ dur: 0.8, vol: 0.45, f0: 200, f1: 2400, type: 'bandpass', q: 2, pos });
}
export function victoryJingle() { // the win is MARKED — a CUE, not music (orchestrator call vs the story-014 freeze); A-minor rise, quiet by design (≤ 0.22): the title bed's dawn swell stays dominant
  beep({ freq: 440, dur: 0.18, vol: 0.18, type: 'triangle' });
  beep({ freq: 523.25, dur: 0.18, vol: 0.18, type: 'triangle', delay: 0.12 });
  beep({ freq: 659.25, dur: 0.22, vol: 0.2, type: 'triangle', delay: 0.24 });
  beep({ freq: 880, dur: 0.5, vol: 0.22, type: 'triangle', delay: 0.36 });
  noiseBurst({ dur: 0.5, vol: 0.1, f0: 2000, f1: 5000, type: 'bandpass', q: 1, delay: 0.36 }); // sparkle
}

/* ---------- stage-6 A1a: UI click voice — module-internal delegation (main.js wiring
   untouched, the composition root stays clear). Every button clicks: title, pause pills,
   panel opens/close, end cards. A context-less or muted click is an honest no-op (the
   primitives gate), so the first-ever click is silent until audioUnlock — muting itself
   clicks-then-silences, which the audit records as correct honest behavior. ---------- */
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('button') : null;
    if (t) sfxUiClick(t.id === 'btn-launch'); // the LAUNCH commit two-tone marks the one button that changes phase
  }, true);
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
