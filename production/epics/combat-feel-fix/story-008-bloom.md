# Story 008: bloom post-processing

> **Epic**: combat-feel-fix (Stage 1 — impression pass)
> **Status**: TODO
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

- [ ] Bloom is active in every rendered phase (title/pad/countdown/ascent/transition/combat) and
      exposes a probe: `__stage2.post === 'bloom'` (debug overlay shows the post chain).
- [ ] Window resize keeps the composer in sync (no stretch, no crash) — resize probe via CDP.
- [ ] Sustained <45 fps drops bloom before it drops DPR further; ≥50 fps for 10 s restores it
      (code path; observed behavior DEFERRED to playtest).
- [ ] Full flow-check 28/28 green, `CONSOLE []` — the render swap breaks nothing.
- [ ] Retained screenshot in `production/qa/evidence/story-008-bloom/` shows the bloomed frame;
      the player's verdict gates the merge.

---

## Implementation Notes

- Composer lifetime: create once in `boot()`; `composer.setSize` in `onResize` next to
  `renderer.setSize`; `setDpr` must also `composer.setSize` (buffer ratio change).
- dprTick ordering: bloom toggle at the top of the degrade ladder (cheap win first), restore at
  the bottom of the recovery ladder.
- Tone: start threshold ~0.85, strength ~0.6, radius ~0.4 — tune against the player's verdict,
  not in isolation.
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

**Status**: [ ] Created — pending

---

## Dependencies

- Depends on: story-007 (merged master baseline; smaller bundle first)
- Unlocks: story-009 (music lands on the visually-final frame)
