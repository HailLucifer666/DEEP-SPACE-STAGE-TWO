# Stage 6 polish — audio audit and spec (A1a + A1b)

Status: plan-of-record for stage 6 "experience polish", owner-approved, audit-revised.
Scope of this doc: the complete audio spec for the stage — current state, gaps by
player impact, the phased fix plan with concrete parameters, the verification
contract, and the keep-passing list. All file:line refs below were spot-checked
against disk on 2026-11-08 unless marked (council). This doc is the builder's
spec: every number here is a binding parameter, not a suggestion.

---

## 1. Current state

**Engine.** 100% synthesized WebAudio, zero audio files (src/audio.js:1 — "Every
sound is math; zero asset files"; src/assets.js:4-5 defers to the CREDITS.md
handoff). `src/assets/sfx/` does not exist yet — the Kenney pack is not staged.

**Primitives** (all in src/audio.js):

| Primitive | Lines | Shape |
| --- | --- | --- |
| `noiseBurst` | 95-109 | swept biquad filter over the shared 2 s brownish noise buffer (:79-92); fast attack ≤ 80 ms (:104), exponential decay |
| `beep` | 112-123 | fixed oscillator, 6 ms attack, exponential decay; **default freq 880 Hz sine** (:112) |
| `sweep` | 126-139 | exponential frequency ramp; **default waveform SQUARE** (:126) |
| `loopStart` | 142-167 | looping filtered noise bed; gain **jumps instantly** (`g.gain.value` :147 — no fade-in); returns the bag handle (alive/setFreq/setVol/stop) registered in `runningLoops` (:165) |
| `vacuumDrop` | 366-378 | noise + sine 340→30 Hz drop (B1 vacuum moment) |

Named recipes riding the primitives (:383-397): `chargeWhine` (383-386),
`chargeRelease` (387-390), `pickupBlip` (391-394), `expireBlip` (395-397).

**Music** = two static pads (`MUSIC_PADS` :187-208, built by `makeMusicBag`
:210-262):

- Title: A2 drone — sine 110 Hz + sine 165 Hz + triangle 220 Hz (detune ±4-7)
  through an LFO-swept lowpass (base 900 Hz ± 250 @ 0.05 Hz) plus a faint
  bandpass noise-air layer.
- Combat: same root + minor third (130.81 Hz) + a 55 Hz sub gated by a 0.8 Hz
  LFO (:206) — **the only rhythm in the game**.

No melody, no tempo, no percussion, no chord movement. Bags are registered in
`runningLoops` (:260) under the `music:true` flag so `musicEvict` (:331-336)
spares them while phase exits kill engine loops.

**Mixing.** master gain 0.9 (:24) → `DynamicsCompressor` created with **DEFAULTS,
never touched** (:21-23): a −24 dB threshold / 12:1 limiter that pumps audibly on
stacked vol-0.5-0.8 bursts. Everything connects straight to master — no buses.
**No `StereoPannerNode`/`PannerNode` anywhere** (council grep empty; confirmed by
full read of audio.js and main.js this session) — every voice is dead-center
mono. The only fake spatialization is `proximityTick` (:350-360): a 300 Hz beep
whose rate (0.7→2.2 Hz) and volume (0.018→0.05) track nearest-enemy distance in
the 5-20 u band. **No voice cap, no per-event rate limiting.**

**Mute plumbing — solid, do not disturb.** `audioUnlock` first-gesture (:32-38,
wired as once-listeners on `pointerdown`/`keydown`, main.js:260-262);
`setMuted` (:45-52) ramps master and persists through `writeMuted`
(src/store.js:43-55); `restoreMuted` (:54-64) reads-without-writing at boot;
pause suspends the audio clock (:67-74); degrade-silent if no WebAudio (:25-27,
warn at :26).

**Event coverage — verified this session:**

- **Boss spawn SILENT**: `spawnBoss` (src/boss.js:130-136) plays nothing. The
  boss is not mute overall — it carries four cues (volley sweep boss.js:166,
  dash-launch burst :195, death-start burst :226, death-final burst :250) — but
  the biggest arrival in the game has no audio moment.
- **Victory has no jingle**: victory.enter plays only the same title-bed
  crossfade the death card uses (src/phases.js:100 — "new music is out of
  scope", the story-014 freeze).
- **Wave-clear silent**: no cue at the wave transition (combat.js wave gate;
  enemies.js — the wave module — imports no audio at all, :16-17).
- **Gunner bolt fire silent**: the fire branch (src/enemies.js:292-303) spawns
  the bolt with zero audio; `fireEBolt` (:336-344, also the boss volley's path)
  likewise. enemies.js imports only `stage-two-lib` and `pool.js`.
- **Raider ram = generic thud only**: the ram (:311-316) fires the shared
  `api.explosion` cue — the same sound as a kill.
- **ALL UI interactions silent**: main.js button wiring (:105-116 — launch,
  skip, controls, credits, reset, sound, panel close, both replay buttons,
  goSkip) contains zero audio calls; main.js's audio import (:12-13) is
  plumbing only (unlock/mute/state getters).
- **Enemy voices**: raiders have **zero** dedicated voice; the drone contributes
  exactly one (the dive telegraph, src/drone.js:225 — 1240 Hz sine); the boss
  dash telegraph tick is the only other enemy-family voice.
- **Warnings are indistinguishable**: the low-hull alarm reuses the plain
  880 Hz sine (audio.js:346) — the `beep` default family — same timbre as
  countdown beeps, the drone telegraph (1240 Hz sine), and the proximity tick
  (300 Hz sine, :357). Threat, UI, and feedback all read as the same beep.

---

## 2. Gaps, ranked by player impact

1. **UI totally silent.** Every button press on the title screen, pause panel,
   and both end cards returns silence. Highest touch frequency in the game and
   the first impression a new player gets — the single cheapest-feeling gap.
2. **Gunner fire silent.** Enemy bolts travel at 20 u/s (enemies.js:22) with
   zero audio warning; the player's only incoming-fire cue is visual tracking.
   This is a combat-safety gap, not just polish — audio here teaches dodge
   timing.
3. **Boss spawn silent.** The fight's phase change arrives with no stinger;
   nothing tells the ears the arena just changed rules.
4. **Victory unmarked.** The win card lands under the same dawn crossfade as
   the death card (phases.js:100). The emotional peak of the game sounds
   identical to its failure.
5. **All voices dead-center mono.** No panner node exists in the project. In a
   full-3D combat arena, audio provides zero directional information;
   `proximityTick` encodes distance as rate, never as space.
6. **Compressor misconfigured.** The untouched DEFAULTS DynamicsCompressor is a
   −24 dB / 12:1 limiter — stacked loud bursts (multi-kills, boss death's
   chained booms at 0.18 s spacing, boss.js:233-240) pump the entire mix.
7. **Warning timbres indistinguishable.** Alarm, telegraphs, countdown, and
   proximity ticks share one sine-beep family; the player cannot tell a threat
   from a UI tick by ear.
8. **Wave-clear silent.** The progression beat is unmarked; waves blur together.
9. **Raider ram ambiguous.** The failure-state hit shares one generic explosion
   cue with kills — hurt and success sound the same.
10. **No voice cap / no rate limiting.** Burst scenarios can stack unbounded
    voices; combines with gap 6 into audible pumping and clutter.
11. **Music is static.** Two pads with no motion over them; long sessions read
    as ambience, not score. (A1b addresses; the pads themselves stay.)

---

## 3. The approved fix plan

Two phases, same run: **A1a** (samples + mixing) lands and greens before **A1b**
(music motion) builds on the bag contract.

### A1a — samples + mixing

**Samples.** Kenney Sci-Fi Sounds, CC0 — license already verified verbatim in
CREDITS.md:14-21. ~8 small .ogg files at `src/assets/sfx/` (the handoff's pick
list: laser, explosion, impact, warp, UI confirm — CREDITS.md:18). Constraints:

- Per file ≤ 120 KB raw; **total ≤ 800 KB raw** (base64 ×4/3 ⇒ ≤ 1.07 MB on the
  bundle; projected single-file build ~5.5-5.7 MB against the 6 MB ceiling).
- **The handoff's music `loop.ogg` (CREDITS.md:21) is DROPPED by size decision**
  (code auditor, council): music + sfx together would push the 4.63 MB build to
  ~6.2-7 MB. Update CREDITS.md in this pass to record the drop — the handoff
  bullet is superseded, not lost.
- **±5% pitch jitter per play** and **synth fallback on decode failure** are
  plan-of-record (CREDITS.md:19).

**Loader.** Extend the esbuild loader map at tools/build.mjs:34 with
`'.ogg': 'dataurl'`. Import samples from a module exactly like the fonts
(src/assets.js pattern — data-URL loaders only apply to JS imports; the static
template bypasses esbuild, assets.js:1-3 documents why).

**LAZY DECODE.** Decode on first use per sample, memoize the `AudioBuffer`
(memoize the Promise, not just the buffer — concurrent first-plays share one
decode). Decode stays **out of the boot window**: boot record is 1155 ms
(council; story-006 marks), documented envelope ≈0.3-2.5 s — the builder must
not add work to module eval or the `boot()` chain.

**Fallback is CONSOLE-SILENT.** A failed/stalled decode plays the synth recipe
and sets status on the probe surface. **No `console.warn` on the sample path** —
the harness gates every page on zero console warnings (tools/flow-check.mjs:64-66
capture; `CONSOLE []` asserts at e.g. :1864, :1883, :1896, :1914, :1930). The
probe-visible status field is the evidence (§4).

**Sample wiring map** (cue → sample family → synth fallback):

| Cue | Trigger | Sample | Synth fallback (binding params) |
| --- | --- | --- | --- |
| Player laser | player fire | laser family, round-robin ×2 | existing `sweep` call site keeps its params; sample replaces it when decoded |
| Explosion / kill | `api.explosion` consumers | explosion ×2, round-robin | existing `noiseBurst` call site params |
| Hit (player hurt) | `damagePlayer` sites | impact | `noiseBurst({ dur: 0.18, vol: 0.3, f0: 1800, f1: 300 })` + `beep({ freq: 200, dur: 0.12, vol: 0.15, type: 'triangle' })` |
| Pickup | powerup collect | warp/confirm | existing `pickupBlip` (:391-394) stays as fallback |
| UI click | every button (:105-116) | UI confirm | see `uiClick` below |
| Enemy bolt fire | gunner branch enemies.js:292-303 **and** boss volley via `fireEBolt`/sweep site boss.js:166 | laser family (enemy variant), round-robin ×2 | `sweep({ f0: 520, f1: 140, dur: 0.14, vol: 0.12, type: 'square' })` |

One coherent enemy-fire voice across gunners and the boss volley (both ride the
same bolt pool, enemies.js:333-335 — one timbre is the point). Wiring note:
enemies.js currently imports no audio module; a direct `import { ... } from
'./audio.js'` is legal (audio.js imports only store.js — acyclic, dep-check
passes) and has the drone.js precedent (`beep` at drone.js:225). Builder's call:
direct import or an `api` pass-through; both keep the cycle out.

**New synth one-shots** (ride the existing `sweep`/`beep`/`noiseBurst` grammar —
no new engine primitives):

| Recipe | Params | Notes |
| --- | --- | --- |
| Boss-spawn stinger | `sweep({ f0: 90, f1: 320, dur: 0.9, vol: 0.22, type: 'sawtooth' })` + `beep({ freq: 55, dur: 0.7, vol: 0.3, type: 'sine' })` + `noiseBurst({ dur: 0.8, vol: 0.45, f0: 200, f1: 2400, type: 'bandpass', q: 2 })` | Fires **only on the natural spawn path** (`spawnBoss` boss.js:130); `spawnForProbe` (:138) stays silent — probe determinism. Total ≈ 1.0 s; the 55 Hz sub ties it to the combat bed's root. |
| Victory jingle | `beep` ×4 triangle, A-minor rise: 440 Hz d0.18 → 523.25 d0.18 → 659.25 d0.22 → 880 d0.5, vol 0.18-0.22, delays 0/0.12/0.24/0.36; + `noiseBurst({ dur: 0.5, vol: 0.1, f0: 2000, f1: 5000, type: 'bandpass', q: 1 })` sparkle | **A CUE, not music** — orchestrator call recorded against the story-014 freeze (phases.js:100). Fired in victory.enter after `musicTo('title')`; enters run once per landing, so no double-fire. Quiet by design (≤ 0.22): the title bed's dawn swell stays dominant. |
| UI click | `beep({ freq: 1200, dur: 0.04, vol: 0.1, type: 'square' })`; the LAUNCH commit adds `beep({ freq: 1800, dur: 0.06, vol: 0.1, type: 'square', delay: 0.05 })` | One shared recipe; the commit two-tone marks the one button that changes phase. When muted, `beep` returns early (:113) — muting itself clicks-then-silences, which is correct honest behavior. |
| Gunner fire fallback | `sweep({ f0: 520, f1: 140, dur: 0.14, vol: 0.12, type: 'square' })` | Row above; listed here so the recipe set is complete. |

**Mixing.**

- **Buses**: `sfxGain` and `musicGain` hang between voices and master.
  `master.connect(comp)` stays; buses connect to master. **Mute stays on
  `master.gain`** (audio.js:50 and :63 — `setMuted`/`restoreMuted` bodies are
  untouched). Music bags' `out.connect(master)` (audio.js:215) becomes
  `out.connect(musicGain)`; the air re-route (:240) follows automatically.
- **Compressor configured deliberately**: threshold −18 dB, ratio 4:1, release
  0.25 s; knee and attack stay at defaults (30 / 3 ms). Replaces the accidental
  −24 dB 12:1 limiter. (Brief allows 3-4:1; 4:1 pinned.)
- **StereoPanner + distance attenuation**, reusing the proximity math: every
  one-shot chain ends `gain → StereoPannerNode → bus`. `pan = clamp(xRel / 30,
  −0.8, 0.8)` where xRel is the source x minus the ship x (world units);
  attenuation gain = 1.0 at d ≤ 5 u, linear down to 0.2 at 45 u (floor 0.2 —
  far events never vanish). `proximityTick` itself is unchanged (its
  rate/volume coding is its design).
- **Voice cap = 24** simultaneous one-shot voices; at cap, refuse the new
  trigger (return null — newest-dropped keeps ongoing feedback like the alarm
  ticking). Counter increments on voice start, decrements on source `onended`;
  track the peak for the probe.
- **Per-event rate limits**: explosion 50 ms, hit 40 ms, enemy bolt fire 50 ms
  (shared across all gunners + boss volley — burst suppression, not per-shooter
  silence), UI click 30 ms. Player laser, alarm, and proximity keep their
  existing drivers (fire rate; frame-gated accumulators).

**Fault-injection relocation (load-bearing).** The `?musicFault=1` throw
(audio.js:275-278) currently sits inside the combat-bed build inside
`crossfadeTo`. When the bag build grows the sequencer path (A1b), the injection
**moves INTO that build path** (still `name === 'combat'`, still once via the
`musicFaultFired` latch) — otherwise the TD-015 probe proves only the old build
shape and the new code runs unguarded and unprobed. **`crossfadeTo`'s catch
contract is preserved VERBATIM** (audio.js:294-300): one warn line (:295), the
best-effort `dyingBag.stop` (:296), `musicTarget = 'none'` (:297), both bags
nulled (:298-299), and the catch never throws.

### A1b — music motion (same run, low-risk shape)

Design ruling (design auditor, plan-of-record): a raw synth sequencer reliably
reads ringtone-cheap; **the pads are warm and in-key — KEEP them**. Add motion;
do not replace.

- **ONE sparse sequenced layer over the pads** (both beds), riding each music
  bag:
  - **Pluck voice**: triangle oscillator → lowpass (cutoff = 4× note
    frequency, Q 2) → gain envelope (5 ms attack, exponential decay to 0.0001
    over 0.35 s) → sequencer level → **bag out-gain**.
  - **Scale: A-minor pentatonic over the A2 root (110 Hz)** so it cannot
    clash — allowed pitches: A2 110.00, C3 130.81, D3 146.83, E3 164.81,
    G3 196.00, A3 220.00, C4 261.63, D4 293.66, E4 329.63, G4 392.00 Hz. (The
    combat pad's 130.81 Hz is a shared tone, not a clash.)
  - **Grid**: 96 BPM — bar = 2.5 s = exactly two of the combat pad's 1.25 s
    sub-gate periods, so the pluck grid phase-locks to the existing 0.8 Hz
    LFO rhythm. 16 steps × 0.15625 s per bar.
  - **Density**: title 2-3 notes/bar at level 0.045; combat 4-6 notes/bar at
    0.06 — pad layer gains run 0.020-0.050 (:192-205), so plucks sit **well
    under pad level**.
  - **Variation**: per loop, swap 1-2 steps in/out of a candidate pool
    (`Math.random` — music is not under the deterministic-probe contract; the
    probe asserts only the note counter, never the pattern).
  - **Percussion: hats only** — a short filtered-noise tick from the
    noise-recipe family (the shared 2 s buffer, bandpass 7 kHz Q 1, 2 ms
    attack / 50 ms decay), 8th-notes at level 0.028 (title 0.018), accent ×1.4
    on steps 0/8, ~85% trigger density. **NO kick/snare in v1** — synth drums
    against the 0.8 Hz sub-gate are the classic cheap tell.
  - **Lookahead scheduling**: schedule ~0.2 s ahead on a ~100 ms timer against
    `c.currentTime`, so frame jank cannot stutter the grid. **Never schedule
    before `audioUnlock`** (the :308 defer gate already keeps bags from
    existing pre-unlock — the scheduler is born with the bag, which satisfies
    this) **or while muted**: the scheduler tick no-ops while muted, and on
    unmute snaps `nextNoteTime = currentTime + 0.05` so the grid resumes
    in-phase rather than stampeding. Pause (context suspend :67-74) freezes
    `c.currentTime`, so the scheduler naturally starves and the grid resumes
    seamlessly on resume.
- **Contract**: sequencer voices ride the **bag contract** — `alive`/`music`/
  `setVol`/`stop`, registered in `runningLoops` (:260) so `musicEvict`
  (:331-336) spares them and the global leak net still sees the music; ALL
  sequencer nodes connect through the **bag out-gain**, so crossfades
  (:264-301) and duck (:323-329 — full boost = ×0.55) own the plucks and hats
  exactly as they own the pads. `bag.stop()` retires the scheduler timer
  together with the nodes.
- The `?musicFault=1` injection lives in this build path (see A1a).

---

## 4. Verification contract

**Today there are ZERO sfx asserts in the harness.** The stage is honest only
when these exist and pass:

**New probe page — `?audioProbe=1`** (probe-gated like src/probes-balance.js:33;
flag-gated capture like the rider-B `E.lastRoll` precedent — the gate lives in
the module that owns the data, flow-check.mjs:1834-1850 shows the harness read).
Exposes `window.__stage2.audioProbe` and the harness asserts:

1. **Samples decoded**: every wired sample reads `status === 'decoded'` with
   `byteLength > 4096` per file (total > 65536).
2. **Sequencer note counter advances monotonically**: read, wait ≥ 1 s, read
   again — second value strictly greater.
3. **Voice cap holds**: under a scripted 30-voice burst (probe hook fires 30
   one-shots in one frame), recorded peak ≤ cap (24).
4. **StereoPanner present**: the probe dumps node types for one triggered cue's
   chain — the dump contains `stereopanner`.
5. **Distance attenuation works**: the same cue at near (≤ 6 u) vs far (≥ 40 u)
   — far-voice gain < near-voice gain.
6. **Mute silences**: with `setMuted(true)`, fire a cue — voice count does not
   change.

**Fault page — `?sfxFault=1`**: forces per-sample decode failure — the synth
fallback fires **per cue** (probe surface reads `status === 'fallback'` for
every sample), **zero console noise** (the page passes a `CONSOLE []` assert),
and the phase still lands (boot → title → combat).

**TD-015 page unchanged** (flow-check.mjs:1603-1639): with the injection
relocated, the page still asserts the phase lands, `musicState() === 'none'`
honest state (audio.js:295-299), exactly one `music bed failed` warn, and no
uncaught exception. If this page goes green while the sequencer build path is
unguarded, the injection was moved wrong — that is the vacuity this contract
exists to prevent.

**EXPLICITLY REJECTED as an assert: `audioLive()`** (`window.__stage2.audioLive`,
main.js:209). The synth fallback keeps it `true` while the sample path is
broken — the false-green class. The probe status field, not the live flag, is
the sample-path truth.

---

## 5. Keep-passing list

These existing contracts must still pass, unchanged, after A1a + A1b:

- **`audioUnlock` first-gesture flow** — once-listeners on
  `pointerdown`/`keydown` (main.js:260-262) → audio.js:32-38, including the
  deferred-`musicTo` flush (:36). Lazy sample decode must never add work to the
  gesture handler itself.
- **Mute persistence battery** (flow-check.mjs:1821-1928): M-key toggle
  write-through, reload persistence both ways, corrupt `'garbage'`/`'2'` seeds
  boot unmuted, byte-identical restore. Mute stays on `master.gain`
  (audio.js:50, :63); the buses hang below that point and nothing in A1a/A1b
  may touch the path.
- **TD-015 fault probe with the honest `'none'` state** (audio.js:295-299) —
  the `crossfadeTo` catch contract, verbatim (§3 A1a).
- **Pause suspends the clock** (audio.js:67-74) — sequencer starves while
  suspended, resumes in phase.
- **Title/combat crossfades** (`musicTo` :303-311, `crossfadeTo` :264-301):
  overlapping fades, out-tau 0.9 / node stop 2.8 s (title→combat) and 0.6 /
  1.8 s (combat→title), the ~4.5 s dawn swell (setVol 1.0, tau 1.5 under
  overlap). The sequencer rides the same out-gain, so no new crossfade code.
- **`musicSetDuck` boost ducking** (audio.js:323-329) — full boost = ×0.55 on
  the combat bag; the sequencer is ducked with it, for free.

---

### Conflict flagged for the pass owner

CREDITS.md:21 still lists the music `loop.ogg` as an active handoff item. The
size decision (§3 A1a) supersedes it. A1a must update CREDITS.md — record the
drop and the reason (base64 ×4/3 against the 6 MB single-file ceiling) — so the
credits doc never points a future builder at an asset that must not ship.
