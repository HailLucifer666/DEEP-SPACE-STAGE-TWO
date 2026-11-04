# Story 014: victory card — the win state

> **Epic**: combat-feel-fix (Stage 2 — boss + victory)
> **Status**: Pending
> **Layer**: UI/Logic
> **Type**: UI
> **Estimate**: M
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-04

## Context

The fight currently never ends: waves climb forever and boss death (story-013) loops to the
next wave. The victory card is the take-home's closing beat — a distinct `victory` phase in
the PHASES machine (the story-011 modules make this a clean addition), triggered by boss
death, with score, time, and REPLAY. **The moment is a player gate** (collected at stage
close per the full-auto grant — screenshots retained).

## Design

- Trigger: `bossDefeated` (story-013's signal) fires once after the slow-mo death finishes
  → `api.go('victory')`. Regular gameover (player death) is untouched; dying TO the boss
  still lands the death card.
- New `victory` phase: `enter()` mirrors gameover's shape (music, blur, card up, highscore
  write) but reads the victory state: final score, elapsed combat time (new: `C.time` in
  combat.js accumulates sdt while alive — reset on enterCombat), and the REPLAY button.
- Overlay: `#victory` in `tools/index.template.html` following the gameover card's DOM/CSS
  pattern (same classes, distinct accent color); joins OVERLAY_ELMS so the story-001 sweep
  hides it on every phase change; `REPLAY` → `setPhase('pad')` (same landing as the death
  card's REPLAY — pad re-seats the rocket).
- Edge: boss killed during rage slow-mo of the PLAYER death must not double-fire (the boss
  signal and player death are mutually exclusive paths — assert it).
- Edge: REPLAY from victory must produce a clean second run (the restart-probe contract:
  pools drain, entity baseline re-primes) — victory REPLAY reuses the pad path, so the
  existing guarantee covers it; the new flow-check assert pins it.

## Acceptance Criteria

- [ ] `victory` phase in `src/phases.js`: enter/exit hooks correct under the exit-before-enter
      sweep; `PLAYING_PHASES` unchanged (victory is a card phase, cursor returns).
- [ ] `#victory` overlay in the template (score, time, REPLAY), hidden by the sweep, shown
      only by the victory phase; no hand-editing index.html — `npm run build` output.
- [ ] `C.time` combat clock in `src/combat.js` (reset each enterCombat, frozen while dead),
      surfaced via `combatState().time` — the card reads it.
- [ ] flow-check GAINS asserts (written **red-on-old**, mutation recorded in the test file):
      1. reach boss (`?bossProbe=1`) → kill → `phase: victory` lands exactly once;
      2. victory card visible with score + time text non-empty;
      3. REPLAY → pad: card hidden, hud visible, reticle off — mirroring the death-card
         REPLAY asserts;
      4. adjacent keep-passing: player death still lands `gameover` (not victory), and a
         second run after REPLAY reaches combat with a clean baseline.
- [ ] flow-check (28 + story-012/013 asserts + these) green on the branch; full probe set
      green; restartProbe clean; CONSOLE [].
- [ ] Retained screenshots `production/qa/evidence/story-014-victory/s14-victory-card.png`
      + `s14-replay-pad.png` + programmer report at
      `production/qa/evidence/story-014-victory/programmer-report.md`.

## Out of Scope

- Endless-mode toggle ("keep playing after victory") — not in any approved plan.
- New music (the existing crossfade lands the title bed under the card).
- Stage 3 work (pitch/3D arena) — untouched.

---

## Files (pre-authorized)

- `src/phases.js` (victory phase), `src/main.js` (wiring/probe surface only if needed)
- `src/combat.js` (time clock + bossDefeated → go('victory')), `src/boss.js` (signal only)
- `tools/index.template.html` (#victory overlay), `tools/flow-check.mjs` (new asserts)
- `production/qa/evidence/story-014-victory/` (report + screenshots + stamp)

---

## Test Evidence

**Status**: [ ] Created — red-on-old record for the four new asserts, probe outputs.

---

## Dependencies

- Depends on: story-011 (phases module), story-013 (bossDefeated + bossProbe).
- Unlocks: Stage 3 (full 3D flight lands on a complete game).
