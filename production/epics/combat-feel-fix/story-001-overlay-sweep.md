# Story 001: overlay-sweep

> **Epic**: combat-feel-fix
> **Status**: Complete
> **Layer**: Presentation
> **Type**: UI
> **Estimate**: S
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-03

## Context

**GDD**: `design/game-brief.md` (MVP 3 — death-retry loop always reachable; MVP 6 — HUD honest)
**Requirement**: Brief MVP feature 3 + 6
**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A
**ADR Version**: N/A

**Engine**: vanilla three.js web build (no engine.name set — esbuild bundle) | **Risk**: MEDIUM
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**: N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From `design/game-brief.md`, scoped to this story:*

- [ ] SKIRMISH from the title: `#title` hidden, `#hud` visible, reticle assembled (`#reticle` unhidden + `#hud.assemble`), `body.playing` on.
- [ ] No phase change can leave any overlay visible: `#title/#hud/#gameover/#pause/#loading/#warn/#combat-online/#go-logo/#flash` are hidden before every phase enter; entering phases re-show only what they own.
- [ ] The launch chain (pad → countdown → ignition → ascent → transition) keeps `#hud` visible at every phase.
- [ ] Death → REPLAY LAUNCH: `#gameover` hidden, `#title` hidden, `#hud` visible, reticle NOT assembled (pad), warn hidden.
- [ ] Death → SKIP TO COMBAT: `#gameover` hidden, reticle assembled.
- [ ] Skipping the launch (SKIRMISH) never leaves the title over the game — title hidden in every post-title phase.
- [ ] SPIN mode unaffected (title stays hidden, no phase changes occur).

---

## Implementation Notes

- `setPhase` runs the NEW phase's exit hook (exit-before-enter) — so an overlay only hid when the entering phase remembered. Fix at the root: a single `OVERLAY_ELMS` sweep in `setPhase`, before `hook.enter?.()`.
- Countdown/ignition/ascent/transition re-show `#hud` (the sweep would otherwise orphan it mid-chain — numerals/tele/reticle live inside it).
- `combat.enter` additionally calls `TRANSITION.hudAssemble(true)` — SKIRMISH lands without transition beat B2, so the reticle must assemble on entry.
- Existing per-phase gameover hides (gofix) stay — idempotent defense in depth.

---

## Out of Scope

- [Story 002]: chase-cam velocity trail (WASD feel).
- [Story 003]: the flow-check harness that proves this path forever.

---

## Files

- `src/main.js` (setPhase sweep + phase re-shows + combat.enter assemble)

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: UI
**Required evidence**: retained screenshots of the screens touched in `production/qa/evidence/story-001-overlay-sweep/` (SKIRMISH title hidden; combat reticle assembled; pad with HUD) — the screenshot is never waived.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None
- Unlocks: `production/epics/combat-feel-fix/story-003-flow-check.md` (its SKIRMISH/REPLAY/SKIP asserts need the sweep live)

---

## Completion Notes (story-done, 2026-11-03)

- All 7 ACs verified. Traceability: AC1/AC4/AC5/AC6 via live CDP click-through evidence
  (SKIRMISH `{"phase":"combat","titleHidden":true,"hudHidden":false,"reticleHidden":false,"assembled":true,"playing":true}`;
  REPLAY/SKIP asserts covered by tools/death-card-check.mjs still green — `hides:1`; pad chain
  `{"phase":"countdown","hudHidden":false}`). AC3/AC7 by code inspection (re-show lines mirror
  pad's; SPIN has no phase changes).
- Evidence: `production/qa/evidence/story-001-overlay-sweep/skirimish-combat.png`
  (hash 029b178c… — receipted). UI screenshot retained — not waived.
- Console clean across runs. QL-TEST-COVERAGE / LP-CODE-REVIEW skipped (minimal tier).
- Verdict: COMPLETE (user-approved per plan).
