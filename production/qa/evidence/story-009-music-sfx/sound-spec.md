# story-009 — Sound spec: music bed, ducking, alarm, proximity

Governing: `production/epics/combat-feel-fix/story-009-music-sfx.md`. Engine = `src/audio.js`
(beep / sweep / noiseBurst / loopStart; master 0.9 → compressor; `runningLoops`; mute/pause guards).
Mood + palette follow `design/game-brief.md` (cold cyan #7dd7ff highs, warm #ff9d54 low undertone);
palette changes route to audio-director. Volumes are linear gain under master 0.9; ~0.3 = existing
SFX reference.

## 1. Title pad — bag `'title'`
Mood: cold, drifting deep-space calm — a slow cyan shimmer over a barely-warm low root.
Root A2 = 110 Hz. Three tonal layers + one noise-air layer, summed into one bag:

| layer | osc type | freq | detune (cents) | gain |
|---|---|---|---|---|
| root (warm floor) | sine | 110 | +4 | 0.050 |
| fifth | sine | 165 (110×1.5) | −4 | 0.035 |
| octave shimmer (cyan) | triangle | 220 (110×2) | +7 | 0.020 |
| noise-air | `loopStart({freq:500,type:'bandpass',q:0.8,playback:0.35})` | — | — | 0.012 |

Shared lowpass on the tonal sum: base 900 Hz, Q 0.7; LFO sine 0.05 Hz (20 s period) × depth 250
→ sweeps 650–1150 Hz. LFO = osc → gain(250) → filter.frequency (zero per-frame JS).
Total bed peak 0.117 ≈ −9 dB under the 0.3 SFX reference. Fade-in: bag `setVol(1.0, tau 1.2)`.

Bag pattern (MANDATORY — loopStart is filtered noise, not tonal; tonal layers cannot come from it):
`makeMusicBag(layers)` builds persistent oscs + per-layer gains + filter + LFO on the live context,
returns `{ alive: true, music: true, setVol(v, tau = 0.15), stop(fadeSec = 0.3) }` — same contract
as the loopStart bag: `setVol` = setTargetAtTime on the bag out-gain (0..1 multiplier; the layer
gains above carry absolute level), `stop` = the loopStart stop() pattern (tau = fadeSec/3, node
stops at fadeSec+0.1, `runningLoops.delete(this)`). Bag registers in `runningLoops` on creation →
`runningLoops`/`loopsStopAll` keep working as the leak net. Set `air.music = true` on the inner
loopStart bag right after creating it (see musicEvict, §7). Max one 'title' + one 'combat' bag alive.

## 2. Combat variant — bag `'combat'`
Same root, denser: the open fifth gains a minor third (A minor = tension) plus a sub pulse.

| layer | osc type | freq | detune (cents) | gain |
|---|---|---|---|---|
| root | sine | 110 | +4 | 0.040 |
| minor third | sine | 130.81 (110×2^(3/12)) | −4 | 0.028 |
| fifth | sine | 165 | +7 | 0.032 |
| sub pulse | sine | 55 (A1) | 0 | 0.045 peak |
| noise-air | `loopStart({freq:320,type:'bandpass',q:1.1,playback:0.5})` | — | — | 0.016 |

Pulse layer: 55 Hz sine gated by an amplitude LFO — lfo sine 0.8 Hz → gain(0.5) → pulseGain.gain
(base 0.5) swings 0..1 at 0.8 Hz. Filter: lowpass base 700 Hz, Q 1.1, LFO 0.11 Hz × depth 300
(400–1000 Hz). Total peak ≈ 0.16 ≈ −5 dB under the SFX reference.

Crossfade on phase switch — OVERLAPPING, both bags run together:
- title→combat: combat starts at 0 (`setVol(1.0, tau 1.2)`), title `setVol(0.0001, tau 0.9)` +
  `stop(2.8)`. Hooked at transition.enter (tension builds across the warp); combat.enter re-issues
  (idempotent) for the title→SKIP path. Overlap ≈ 2.5 s, no clicks (setTargetAtTime only).
- combat→title (death→card): title in tau 1.5 (~4.5 s dawn), combat out tau 0.6 + `stop(1.8)`.
- `musicTo(name)` is idempotent (name already current + alive → no-op). No context yet (boot→title)
  or muted: store `wanted = name`; flush on `audioUnlock()` and `setMuted(false)`. Never schedules
  while muted — same discipline as the one-shot guards.

## 3. Ducking (boost ducks the pad)
Per frame in tickCombat, after `C.flow` updates: `musicSetDuck(C.flow)` →
`combatBag.setVol(1 − 0.45 × flow, 0.1)`. Full boost = multiplier 0.55 → combat bed 0.16 → 0.088.
Attack/release ride C.flow's existing exp smoothing (rate 4/s ≈ 0.25 s); tau 0.1 only de-zits the
target chase. Title bag ignores ducking (no boost on title).

## 4. Low-hull alarm
- Beep: `beep({freq: 880, dur: 0.12, vol: 0.13, type: 'sine'})` every 900 ms — frame-gated
  accumulator (`alarmT -= dt; if (alarmT <= 0) { beep(...); alarmT = 0.9; }`), never setTimeout.
- Trigger hp < 25; re-arm hp ≥ 35 (hysteresis — no chatter). Silences when C.dead; phase exit stops
  the tick. State self-heals on retry (hp = 100 ≥ 35 → re-armed on the first frame).
- Cap 0.13: under kill-confirm (0.16) and hit bursts (0.4–0.8); 880 Hz stays clear of the
  260→90 Hz hull-hit noise. Expose `alarmActive()` for the probe surface (AC).

## 5. Enemy-proximity cue (hostile closing in)
- Nearest alive hostile distance d via `ENEMIES.eachAlive` (full 3D), recomputed ≤ every 0.15 s.
- Active when d < 20 u: `beep({freq: 300, dur: 0.06, vol, type: 'sine'})` on a gated accumulator.
- rate = 0.7 + (20 − d)/15 × 1.5 Hz → 0.7 Hz at 20 u, 2.2 Hz at 5 u (clamp d ≥ 5).
- vol = 0.018 + (20 − d)/15 × 0.032 → 0.018 at 20 u, hard cap 0.05 at ≤ 5 u — quieter than the
  quietest weapon SFX (fire sweep 0.12). Silent when d ≥ 20, no hostiles, or C.dead.
- Distinct from the alarm: 300 Hz short tick vs the 880 Hz alarm tone.

## 6. Mixing discipline
| layer | peak linear | priority |
|---|---|---|
| combat SFX one-shots | 0.12–0.8 | 1 — always wins |
| low-hull alarm | 0.13 cap | 2 |
| proximity cue | 0.05 cap | 3 |
| music (title / combat) | 0.117 / 0.16 | 4 |
| deep-space bed (existing C.bed) | 0.05 | 5 |

Invariants this spec RELIES ON (already true — do not re-implement): `setMuted` drives master gain
to 0 (tau 0.05) and silences every layer including music; `audioSuspend` freezes the context clock
so LFOs, loops and scheduled nodes freeze, and `audioResume` restores them unchanged. Music sums
stay ≤ 0.16 so the existing compressor keeps SFX transients on top.

## 7. Implementation notes
New exports in audio.js: `musicTo(name)`, `musicSetDuck(flow)`, `alarmTick(dt, hp, dead)`,
`proximityTick(dt, nearestDist|null)`, `musicEvict(fadeSec)` (= loopsStopAll but skips bags with
`music === true`), private `makeMusicBag()`, probe getters `musicState()` / `loopsCount()`.
Exact calls per event:
- title.enter, pad.enter → `musicTo('title')` (idempotent; deferred until unlock if no context)
- transition.enter → `musicTo('combat')` — warp crossfade starts
- combat.enter → `musicTo('combat')` — SKIP path; no-op when already current
- gameover.enter → `musicTo('title')`
- combat.js enterCombat (L305) and clearCombat (L399): replace `loopsStopAll(0.2/0.25)` with
  `musicEvict(0.2/0.25)` — engine loops (ascent rumble, C.bed) die as today, music survives.
  AUDIT launch.js (imports loopsStopAll, L9 — rumble/wind/whoosh teardown): every call site that
  must spare music uses musicEvict. Music bags are stopped ONLY by musicTo / their own stop().
- tickCombat: exactly one `alarmTick(dt, C.hp, C.dead)`, one `proximityTick(dt, nearest)`, one
  `musicSetDuck(C.flow)` per frame — no other per-frame audio calls.
Hook placement: all `musicTo` calls live in main.js PHASES enter hooks (music is phase-owned);
combat.js only hosts the per-frame ticks. Leak probe updates: runningLoops is no longer empty on
title/combat — assert `loopsCount()` equals the expected count per phase (title 2, combat 3 incl.
C.bed) and 0 only after a full stop-all; keep `runningLoops` as the global leak net.
Kenney conditional: if `src/assets/sfx/` lands, `sample()` adds one-shots only — this spec is
unchanged and samples inherit the same mute invariant.
Do NOT: stack loops per frame; build tonal layers from loopStart; use setTimeout for cadences;
schedule while muted (defer instead); cut music with instant gain jumps (setTargetAtTime only);
change setMuted / audioSuspend / loopsStopAll semantics; let clearCombat kill the music bags
(evict spares them — the phase hooks own stopping them).

Spec by: sound-designer (GLM) · 2026-11-04 · for story-009
