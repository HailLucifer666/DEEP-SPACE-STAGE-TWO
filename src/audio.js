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
