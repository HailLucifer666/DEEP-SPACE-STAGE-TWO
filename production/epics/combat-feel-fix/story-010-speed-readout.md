# Story 010: speed readout + gameover sag verdict

> **Epic**: combat-feel-fix (Stage 1 — impression pass)
> **Status**: Complete
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

- [x] `SPD` readout visible in the combat HUD (the `#tele` block, right-top) showing current
      speed in u/s — cruise 17, boost ceiling 32.3, brake 0 (probe-asserted on BOTH the DOM
      text and `combatState().speed`).
- [x] Readout updates live: 13/13 speed-probe assertions (W-hold ≥14 within 1 s; boost raised
      ceiling; brake ≤3).
- [x] The DOM write is change-gated: proven with an instrumented setter — 0 writes at held
      cruise, writes only on the rounded value changing; 8 Hz cadence mirrors cruise's writer
      (TD-009 discipline).
- [x] Full flow-check 28/28 green, `CONSOLE []` (implementer + orchestrator re-run on merged
      master).
- [x] Gameover sag verdict recorded headed: **artifact, pinned** — RTX 3060 (D3D11, 144 Hz):
      combat avg 143.2 fps (min 126) vs gameover avg 144.0 fps (min 144), −0.6%, both
      vsync-pinned; the headless 54-vs-60 gap is software-render cost of the death card's
      `backdrop-filter` blur (CPU raster). Documented non-fix; no unapproved code entered.
- [x] Retained screenshot `production/qa/evidence/story-010-speed-readout/s10-combat-hud.png`
      (SPD line visible in the live HUD).

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

**Status**: [x] Created — `production/qa/evidence/story-010-speed-readout/`: programmer-report.md
(with the headed fps table + two documented measurement traps), s10-combat-hud.png, stamp.txt on
commit. Note: `tools/index.template.html` ended up unchanged — `#tele` needed no template edit
(justified in the report); the cruise telemetry that used to sit frozen in combat is replaced by
the live SPD line for the fight's duration.

---

## Dependencies

- Depends on: story-008/009 merged (last slice lands on the final Stage 1 frame)
- Unlocks: Stage 2 (the HUD language the boss HP bar joins)

---

## Completion Notes (story-done, 2026-11-04)

- Presentation choice: `#tele` over `#hud-bars` — combat.js owns the bars block via a wholesale
  gated `innerHTML` write, so a main.js SPD line there would be wiped on the next hull change;
  `#tele` had no combat writer at all (the frozen ascent telemetry finding).
- The sag verdict closes the r2 "visual/perf pass candidate" with data instead of a guess: the
  death card is free on real GPUs. Stage-2 note if anyone re-opens it: the cost only exists on
  CPU rasterizers.
- Two measurement traps documented for future soaks: (1) an occluded headed Edge window freezes
  rAF and leaves fps.read at its 60 init forever — fixed in the probe with
  `--disable-features=CalculateNativeWinOcclusion` + visibility checks (same class as the
  boot-marks occlusion note); (2) natural death can stall indefinitely when wave 1's surviving
  gunner loses to shield regen — the existing `?restartProbe=1` forced-death path is the
  deterministic gameover entry.

---

## Dependencies

- Depends on: story-008/009 merged (last slice lands on the final Stage 1 frame)
- Unlocks: Stage 2 (the HUD language the boss HP bar joins)
