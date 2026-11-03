# Story 010: speed readout + gameover sag verdict

> **Epic**: combat-feel-fix (Stage 1 — impression pass)
> **Status**: TODO
> **Layer**: UI
> **Type**: UI
> **Estimate**: S
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-04

## Context

**GDD**: `design/game-brief.md` (MVP 4 — controls that FEEL right); review r2's open UX advisory:
**with cruise-hold the player cannot see their current speed** — throttle is a state, not a
key, so the feedback loop is blind. Also carries the gameover-screen fps sag question with its
first measured numbers: soak 2026-11-04 shows **gameover avg 54 fps (min 44) vs combat avg 60**
under the software renderer; story-006 established headed/real-GPU as the decision target.
**ADR Governing Implementation**: N/A (minimal)

**Design decision:** a speed/throttle readout in the combat HUD — the `#tele` telemetry block
(right-top, `tools/index.template.html` line ~32) gains a `SPD` line, written change-gated like
every other HUD write (TD-009 discipline). The sag half is a **measurement verdict, not a fix**:
re-measure gameover fps headed (real GPU). Fix only if the sag is real there; otherwise record
the headed numbers as the pinning evidence that it is a headless-software-render artifact.

**Approved by the user** in the Stage 1 plan (2026-11-04).

---

## Acceptance Criteria

- [ ] `SPD` readout visible in combat HUD showing current speed in u/s (cruise 17, boost to
      ~32, S → 0).
- [ ] Readout updates live: W-hold probe sees ≥14 within 1 s; boost probe sees the raised
      ceiling; brake probe sees ≤3 (flow-check-style probes against `combatState().speed`).
- [ ] The DOM write is change-gated: unchanged speed does not touch `textContent` (code review +
      the existing gated-write pattern).
- [ ] Full flow-check 28/28 green, `CONSOLE []`.
- [ ] Gameover sag verdict recorded headed: fixed (with before/after numbers) or documented
      non-fix (headed numbers prove headless-only), written into Test Evidence.
- [ ] Retained screenshot in `production/qa/evidence/story-010-speed-readout/`.

---

## Implementation Notes

- Speed source: `COMBAT.combatState().speed` already exposed (flow-check probes use it) — the
  readout is presentation-only; no combat.js changes expected.
- Update cadence: gate on rounded value change (integers u/s), not per-frame.
- Sag re-measure: reuse `tools/boot-marks.mjs` pattern (headed, read `fps.read` per phase) or a
  short headed probe — document the numbers either way.

## Out of Scope

- Other HUD additions (boss HP bar is story-013); settings UI; the boost-meter flutter noted
  in r2 (documented-not-changed there); TD-009 edge-pip strings (separate).

---

## Files

- `tools/index.template.html` (#tele SPD line + CSS if needed)
- `src/main.js` (gated write in the HUD update path)
- (only if sag is real: `src/main.js` gameover path — TBD by measurement)

---

## QA Test Cases

*N/A — speed probes + flow-check + retained screenshot are the acceptance evidence.*

---

## Test Evidence

**Status**: [ ] Created — pending

---

## Dependencies

- Depends on: story-008/009 merged (last slice lands on the final Stage 1 frame)
- Unlocks: Stage 2 (the HUD language the boss HP bar joins)
