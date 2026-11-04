# Epic: combat-feel-fix

> **Source**: `design/game-brief.md` — Build order #1 (the two BLOCKING feel defects + the path harness).
> **Created**: 2026-11-03 · **Tier**: workflow minimal · **QA**: qa.level minimal (QA specs N/A; CDP harnesses are the evidence).

## Stories

| # | Story | Type | Estimate | Status |
| --- | --- | --- | --- | --- |
| 001 | overlay-sweep | UI | S | Complete |
| 002 | wasd-cam | Visual/Feel | S | Complete |
| 003 | flow-check | Logic | M | Complete |
| 004 | nms-controls | Logic/Feel | M | Complete |
| 005 | soft-boundary | Logic/Feel | S | Complete |
| 006 | measure-boot | Logic (instrumentation) | S | Complete |
| 007 | lazy-storage | Logic | M | Complete |
| 008 | bloom | Visual/Feel | S | Complete |
| 009 | music-sfx | Visual/Feel | M | Complete |
| 010 | speed-readout | UI | S | Complete |
| 011 | mainjs-split | Logic (refactor) | M | Complete |
| 012 | vi3w-drone | Logic | M | Complete |
| 013 | boss-fight | Logic/Feel | L | Pending |
| 014 | victory-card | UI/Logic | M | Pending |

## Notes

- Story-001 fixes TD-001 (stuck title on SKIRMISH + the whole overlay class) and the
  SKIRMISH no-crosshair gap.
- Story-002 fixes TD-002 (chase camera cancels straight-line velocity — WASD thrust invisible).
- Story-003 fixes TD-004 (no committed flow regression harness).
- Story-004 replaces story-002's strafe scheme with throttle+turn (velocity-derived heading was
  the root cause "W flips the camera"); probes rewritten red-on-old, mutation run in qa/evidence.
- Story-005 replaces the hard square arena clamp with a soft circular boundary (the repeat
  "stuck at the edge" class — ARENA_HALF was already 3x'd once for the same symptom).
- Stories 006–010 = Stage 1 of the approved 9999x roadmap (2026-11-04); ledger:
  `one-shot-work/stage-1/`. Playtest 2026-11-04: verdict "mostly good, small notes" — notes
  not yet attached; add them here when they surface. Stage 0 closed at tags
  `good-2026-11-04` and `good-2026-11-04-b` (both merge results flow-checked 28/28;
  soak 2026-11-04 clean: 30 combat entries, 29 death-retry cycles, 0 console anomalies).
- **Backlog (player screenshots, 2026-11-04): title screen barely shows the hero ship** —
  small, dark, hidden behind the title text and HIGH SCORE line (pre-existing camera framing;
  tickTitle orbits at r=6.8 with the ship centered behind the UI stack). Fix rides with
  story-008's visual pass: bring the hero forward/below the text line so the first frame
  showcases the model.
