# Story 003: flow-check

> **Epic**: combat-feel-fix
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Logic
> **Estimate**: M
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-03

## Context

**GDD**: `design/game-brief.md` (MVP 7 — evidence harness: paths never regress)
**Requirement**: Brief MVP feature 7
**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A
**ADR Version**: N/A

**Engine**: vanilla three.js web build (no engine.name set — esbuild bundle) | **Risk**: LOW
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**: N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From `design/game-brief.md`, scoped to this story:*

- [ ] Boot → title: `#title` visible; click **SKIRMISH** → phase combat, `#title` hidden, `#hud` visible, reticle assembled (`#reticle` unhidden + `#hud.assemble`), `body.playing` on.
- [ ] Synthetic keyboard probe: hold W 1.5 s → player arena position moves ≥ 15 units; keyup → stops. Same axis sanity for A and D.
- [ ] Idle to natural death → `#gameover` visible; click **REPLAY LAUNCH** → phase pad, `#gameover` hidden, `#title` hidden, `#hud` visible, reticle hidden, warn hidden.
- [ ] Walk pad → countdown → ignition → ascent → transition: `#hud` visible at every phase (the sweep never orphans it).
- [ ] Through rift/warp/logo → combat with exactly one combat entry (`combatEntries` delta 1).
- [ ] Death → click **SKIP TO COMBAT** → combat, `#gameover` hidden, reticle assembled.
- [ ] `CONSOLE []` across the whole run (no exception/details).

---

## Implementation Notes

- New `tools/flow-check.mjs` — the same CDP plumbing as `tools/death-card-check.mjs`
  (headless Edge, real `Input.dispatchMouseEvent` clicks + `element.click()` + synthetic
  `KeyboardEvent`), extended into a full flow walk.
- Runs from the project root: `node tools/flow-check.mjs` (bakes the `?debug=1` URL).
- 62000 ms boot waits (headless decodes two GLBs, ~55–60 s).

---

## Out of Scope

- [Story 001]/[Story 002] are the subjects under test — not re-implemented here.
- Full regression suite: this harness covers the critical flow, not every probe.

---

## Files

- `tools/flow-check.mjs` (new)

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: the harness's real run output (steps + asserts) — at qa.level minimal game tests are waived, but the harness IS the project's critical-path evidence; quote its full PASS output in `production/qa/evidence/story-003-flow-check/`.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/combat-feel-fix/story-001-overlay-sweep.md` + `production/epics/combat-feel-fix/story-002-wasd-cam.md`
- Unlocks: None

---

## Completion Notes (story-done, 2026-11-03)

- `tools/flow-check.mjs` shipped and verified **17/17 PASS** on the built game (boot→title, SKIRMISH overlays, WASD probes, natural death→REPLAY→pad walk with hud-visible-at-every-phase, single combat entry, death→SKIP, `CONSOLE []`).
- `combatState()` gained the `pos` probe field (2-decimal `[x,y,z]`) — the harness's only movement observability.
- Note: AC #2's W/A/D axis asserts pin the *story-002 strafe scheme*. [Story 004] reworks controls to throttle+turn and rewrites those probes (red-on-old mutation run recorded there); the harness's overlay/phase asserts are unaffected.
