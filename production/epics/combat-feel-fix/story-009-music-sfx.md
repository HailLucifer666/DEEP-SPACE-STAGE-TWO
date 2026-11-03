# Story 009: music bed + SFX enrichment

> **Epic**: combat-feel-fix (Stage 1 — impression pass)
> **Status**: Complete
> **Layer**: Feature (audio)
> **Type**: Visual/Feel
> **Estimate**: M
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-04

## Context

**GDD**: `design/game-brief.md` (MVP 1 — the first impression); roadmap Stage 1. CREDITS.md
documents the Kenney CC0 handoff as pending; the game is currently competent synth SFX with
**no music at all** — the largest silence in the presentation.
**ADR Governing Implementation**: N/A (minimal)

**Design decision:** procedural music via the existing synth engine (`src/audio.js`): a slow
pad loop on title (calm), a denser combat variant (tension), crossfaded by phase; boost ducks
the pad via the existing `loopStart` handle (`setVol`). Enrichment: low-hull alarm (hp < 25,
beep pattern, repeats), enemy-proximity cue (nearest hostile distance drives a subtle pulse).
All loops register in `runningLoops` and die on phase exits via `loopsStopAll` — no leaks.
Mute (`setMuted`) and pause (`audioSuspend`) already govern the master/context and must keep
working unchanged.

**Sound-designer spec** (dispatched subagent, filled at implementation start): mood, chord
palette, ducking curve, alarm cadence, proximity threshold — written into
`production/qa/evidence/story-009-music-sfx/sound-spec.md`.

**Approved by the user** in the Stage 1 plan (2026-11-04).

---

## Acceptance Criteria

- [x] A pad loop is audible on title and a distinct combat variant in combat; phase switches
      crossfade overlapping via idempotent `musicTo()` (title A2 open fifth → combat A minor +
      55 Hz 0.8 Hz pulse, per the sound spec) — no clicks (setTargetAtTime-only fades; probe:
      musicState 'combat'/'title', never 'none' after unlock).
- [x] Boost ducks the combat bed via `setVol(1 − 0.45 × C.flow, 0.1)`; hull < 25 triggers the
      880 Hz alarm (900 ms cadence, re-arm ≥35, cap 0.13, silent when dead); nearest-hostile
      <20 u drives the 300 Hz proximity tick (0.7→2.2 Hz, ≤0.05) — player ears verdict:
      "sounds right" 2026-11-04.
- [x] Mute silences everything; pause freezes the audio clock — `tools/combat-probe.mjs` green
      (mute PASS, holdfire PASS, honest PASS, `CONSOLE []`), re-run independently post-swap.
- [x] No loop leaks: `max loops 3 over 30 samples across 3 death-retry cycles` (expected count
      per phase per the spec — music bags are SUPPOSED to live in runningLoops; the old
      empty-set assertion is obsolete by design).
- [x] Kenney conditional resolved: `src/assets/sfx/` absent → synth-only shipped, CREDITS.md
      handoff note stays untouched; build + flow-check 28/28 green, `CONSOLE []`.
- [x] Retained evidence in `production/qa/evidence/story-009-music-sfx/` (spec, programmer
      report with probe outputs, combat debug screenshot, stamp.txt); player's ears gate
      passed.

---

## Implementation Notes

- Music = 2–3 detuned oscillator layers through a lowpass + slow LFO on the filter — build on
  `loopStart`'s bag (it already handles fade/stop lifecycle); a chord is 2–3 bags.
- Alarm cadence from the sound spec; never schedules while muted (the `getC()/muted` guards
  in audio.js already no-op one-shots — loops must respect the same).
- Kenney inlining: `tools/build.mjs` reads `src/assets/sfx/*.{ogg,wav,mp3}` → base64 →
  `window.__SFX_B64` map; `audio.js` gains a `sample()` that decodes on unlock. Absent dir =
  empty map, zero behavior change.

## Out of Scope

- Spatial/3D audio; music customization; volume slider (settings persist is story-020);
  adaptive combat intensity scoring.

---

## Files

- `src/audio.js` (music bags, alarm, proximity, sample())
- `src/main.js` (phase-driven music switching, ducking call sites)
- `src/combat.js` (low-hull + proximity hooks feeding audio)
- `tools/build.mjs` (Kenney conditional inlining)
- `CREDITS.md` (only if Kenney lands)

---

## QA Test Cases

*N/A — combat-probe + a loop-leak probe + retained evidence are the acceptance evidence.*

---

## Test Evidence

**Status**: [x] Created — `production/qa/evidence/story-009-music-sfx/`: `sound-spec.md`
(sound-designer, parameter-complete), `programmer-report.md` (probe outputs: combat →
musicState 'combat', loopsCount 3 in every stint, max 3 over 30 samples/3 cycles, restartProbe
clean:true), `story009-combat-debug.png`, stamp.txt. flow-check 28/28 `CONSOLE []` on the
branch (implementer + orchestrator re-run after the transition.js swap).

---

## Dependencies

- Depends on: story-008 (final frame the music sits under)
- Unlocks: Stage 2 (boss gets the audio language for free)

---

## Completion Notes (story-done, 2026-11-04)

- The spec caught a design conflict before it shipped: `loopsStopAll` at engine-teardown sites
  would have killed the crossfading music. Resolution: `musicEvict(fade)` (spares `music`-flagged
  bags) replaced it at combat.js ×2, launch.js resetStage, AND transition.js clearTransition —
  the last site was missed by the spec's audit, surfaced by the implementer as an out-of-scope
  flag, and swapped by the orchestrator in the main thread (verified: transition.js owns no
  loops of its own, so the swap preserves the engine-loop teardown semantic exactly).
- C.bed (combat's deep-space bed) persists through gameover by the pre-existing
  exit-before-enter phase mechanics — bounded (it fades under the gameover card) and verified
  leak-free; noted here so nobody "fixes" it blindly in Stage 2.
- Ducking idle-threshold and air-layer gain routing were reconciled to the spec during
  implementation (documented in the programmer report).
- Kenney handoff remains open exactly as CREDITS.md documents; `sample()` was NOT added — no
  dead code for an asset that has not landed.

---

## Dependencies

- Depends on: story-008 (final frame the music sits under)
- Unlocks: Stage 2 (boss gets the audio language for free)
