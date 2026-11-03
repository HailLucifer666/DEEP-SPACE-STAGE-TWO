# Story 002: wasd-cam

> **Epic**: combat-feel-fix
> **Status**: Ready
> **Layer**: Core
> **Type**: Visual/Feel
> **Estimate**: S
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-03

## Context

**GDD**: `design/game-brief.md` (MVP 4 — controls feel right: WASD thrust visibly moves the ship in frame)
**Requirement**: Brief MVP feature 4
**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A
**ADR Version**: N/A

**Engine**: vanilla three.js web build (no engine.name set — esbuild bundle) | **Risk**: LOW
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**: N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From `design/game-brief.md`, scoped to this story:*

- [ ] Holding W (keyboard nav) visibly surges the ship ahead in frame — the chase camera no longer cancels straight-line velocity.
- [ ] Releasing W settles the ship back toward center-screen (the trail decays).
- [ ] Turning (A/D) keeps its visible swing; the camera does not fight the turn.
- [ ] Mouse steering path is untouched: pointer-aim still chooses the target when no key is held.
- [ ] Arena soft-clamp and warning behavior unchanged (clamp still at ±80).
- [ ] No per-frame allocation added in the camera path (reuse existing scratch vectors).

---

## Implementation Notes

- Root cause: `src/combat.js` `tickCombat` chase-cam target is position-only —
  `camTarget = pos − forward·7.5 (+3.4 y)` matches the ship's velocity exactly, parking it
  dead-center at any speed. Input recording + steer math are verified correct (keys reach
  `input.keys`, the keyboard branch wins over the mouse).
- Fix: velocity trail — `camTarget = pos − forward·7.5 − vel·0.22` (≈3.7-unit offset at
  cruise speed 17), and the follow lag `k` 6 → 5 so the offset reads instead of being eaten
  by the lerp.

---

## Out of Scope

- [Story 001]: overlay sweep (this story's evidence is captured with it live).
- [Story 003]: the flow-check harness (which will assert the keyboard→motion path).

---

## Files

- `src/combat.js` (tickCombat camera block: camTarget line + k)

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Visual/Feel
**Required evidence**: retained screenshot of W-thrust in frame (ship visibly ahead of center) in `production/qa/evidence/story-002-wasd-cam/` + sign-off in `production/qa/evidence/story-002-wasd-cam-evidence.md` — never waived.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/combat-feel-fix/story-001-overlay-sweep.md` (evidence is captured with the HUD visible)
- Unlocks: `production/epics/combat-feel-fix/story-003-flow-check.md` (its WASD probe asserts the motion the camera now shows)
