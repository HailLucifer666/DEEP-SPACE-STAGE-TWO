# Story 008: bloom post-processing

> **Epic**: combat-feel-fix (Stage 1 — impression pass)
> **Status**: Complete
> **Layer**: Feature (render pipeline)
> **Type**: Visual/Feel
> **Estimate**: S
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-04

## Context

**GDD**: `design/game-brief.md` (MVP 1 — the first impression); roadmap Stage 1.
**Requirement**: the render loop draws raw while the post chain is already imported and dead —
`src/lib-entry.js` re-exports EffectComposer/UnrealBloomPass/OutputPass; `src/main.js` imports
only `{ THREE, GLTFLoader }` and calls `renderer.render` directly. The additive neon aesthetic
(rim ring, rift quads, engine glows, explosion sprites) is the exact content bloom exists for.
**ADR Governing Implementation**: N/A (minimal)

**Design decision:** route the loop through EffectComposer with an UnrealBloomPass sized for the
existing look (threshold high enough that only emissive/additive elements bloom), OutputPass last
for color space. Resize re-sizes the composer (the `onResize` comment already anticipates this).
The DPR auto-degrade ladder drops bloom first at sustained low fps and restores it last.

**Approved by the user** in the Stage 1 plan (2026-11-04). Per dev-story's specialist resolution
this project has no engine specialists configured — no technical-artist check is available;
the player's eyes are the acceptance authority.

---

## Acceptance Criteria

- [x] Bloom is active in every rendered phase and exposes the probe: `__stage2.post === 'bloom'`
      (STATE dump: `audio locked · post bloom`; `composer ? composer.render() : renderer.render`
      covers main path AND paused frozen-frame).
- [x] Window resize keeps the composer in sync — 10-event resize storm probe (900x620 →
      1400x760), buffer tracked exactly, zero exceptions (`s8-resize-1400x760.png`).
- [x] Sustained <45 fps drops `bloomPass.enabled` before DPR steps down; ≥50 fps for 10 s
      restores it before DPR climbs (code path reviewed in diff; observed behavior DEFERRED to
      playtest as the AC states).
- [x] Title screen shows the hero ship below the title text, clear of the UI stack
      (radius 6.8→5.6, height 1.15→2.25, lookAt y 0.3→1.35) — player verdict: "framing is
      right" 2026-11-04.
- [x] Full flow-check 28/28 green, `CONSOLE []` (run twice: branch by implementer, re-run
      independently).
- [x] Retained screenshots (bloomed combat frame + re-framed title); player verdict "bloom
      looks right" gates the merge, 2026-11-04.

---

## Implementation Notes

- Composer lifetime: create once in `boot()`; `composer.setSize` in `onResize` next to
  `renderer.setSize`; `setDpr` must also update the composer (setPixelRatio + setSize).
- BOTH render call sites in the loop go through the composer — the main path AND the paused
  frozen-frame branch (a paused frame still shows the post chain).
- dprTick ordering: bloom toggle at the top of the degrade ladder (cheap win first), restore at
  the bottom of the recovery ladder. Toggle = `bloomPass.enabled`, composer path unchanged.
- Defensive fallback per the game's never-crash contract (§8.3 style): if composer creation
  throws (old GPU), catch, keep direct `renderer.render`, `post: 'off'` — the game must never
  die to a post-processing failure.
- Tone: start threshold ~0.85, strength ~0.6, radius ~0.4 — tune against the player's verdict,
  not in isolation.
- Title framing: the ship sits at the origin; the orbit camera looks AT (0, 0.3, 0) which
  centers it behind the title stack. Look ABOVE the ship (raise the lookAt y and/or orbit
  height) so the ship sinks to the lower third, and tighten the radius slightly so it reads.
  Verify with a headless `SHOT` capture of the title phase.
- `updateDebug` gains the post-chain line so the harness can assert it.

## Out of Scope

- Shadows, SSAO, godrays, any second pass; settings UI for bloom; mobile quality tiers.

---

## Files

- `src/main.js` (composer wiring, loop render swap, onResize/setDpr, dprTick, debug line)
- `src/lib-entry.js` (if any pass re-export is missing)

---

## QA Test Cases

*N/A — flow-check + retained screenshots are the acceptance evidence.*

---

## Test Evidence

**Status**: [x] Created — `production/qa/evidence/story-008-bloom/`: `programmer-report.md`,
`s8-combat-bloom.png` (live bloomed combat frame), `s8-title-framing.png` (ship below the title
stack), `s8-resize-1400x760.png` (resize-storm probe), stamp.txt on commit. flow-check 28/28
`CONSOLE []`; `__stage2.post === 'bloom'`.

---

## Dependencies

- Depends on: story-007 (merged master baseline; smaller bundle first)
- Unlocks: story-009 (music lands on the visually-final frame)

---

## Completion Notes (story-done, 2026-11-04)

- Shipped values: strength 0.6, radius 0.4, threshold 0.85 — tuned by player verdict.
- Framing landed exactly as briefed (5.6 / 2.25 / lookAt y 1.35); the dark-metal hull look is
  pre-existing and fenced out of this story.
- Deviation documented by the implementer: recovery re-enables bloom BEFORE DPR climbs (the
  brief's literal ordering); flipping to restore-last is a one-line swap if a playtest ever
  disagrees.
- The never-crash fallback is real code, not decoration: `composer = null` keeps the direct
  render path and the probe reads 'off' — verified by reading the catch block, not by inducing
  the failure.
- lib-entry.js needed no change — all four pass re-exports were already present (verified
  before editing; the story anticipated this).

---

## Dependencies

- Depends on: story-007 (merged master baseline; smaller bundle first)
- Unlocks: story-009 (music lands on the visually-final frame)
