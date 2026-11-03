# Story 009: music bed + SFX enrichment

> **Epic**: combat-feel-fix (Stage 1 — impression pass)
> **Status**: TODO
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

- [ ] A pad loop is audible on title and a distinct combat variant in combat; phase switches
      crossfade without clicks (loops stopped, not cut).
- [ ] Boost audibly ducks the pad; hull < 25 triggers the repeating alarm until recovered;
      a nearby raider produces the proximity cue (playtest-verifiable states; probe surface
      exposes active loop count + alarm flag).
- [ ] Mute (M / button) silences everything; pause (P/ESC) freezes the audio clock; resume
      restores — `tools/combat-probe.mjs` stays green.
- [ ] No loop leaks: every phase exit stops its loops (`runningLoops` empty after leaving
      combat; verified by probe after death → title path).
- [ ] Kenney conditional: if `src/assets/sfx/` contains audio files at build time they are
      inlined and credited in CREDITS.md; otherwise synth-only ships and the handoff note
      stays. Either way build + flow-check 28/28 green, `CONSOLE []`.
- [ ] Retained evidence in `production/qa/evidence/story-009-music-sfx/` (probe output +
      debug-overlay screenshot); the player's ears gate the merge.

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

**Status**: [ ] Created — pending

---

## Dependencies

- Depends on: story-008 (final frame the music sits under)
- Unlocks: Stage 2 (boss gets the audio language for free)
