# Story 004: NMS-style controls (throttle + turn)

> **Epic**: combat-feel-fix
> **Status**: Complete
> **Layer**: Visual-Feel
> **Type**: Logic
> **Estimate**: M
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-03

## Context

**GDD**: `design/game-brief.md` (MVP 4 — controls that FEEL right)
**Requirement**: Live player report: "W just changes the camera direction" + "WASD doesn't work
properly — I need W accelerate, S brake, A/D turn left/right, like No Man's Sky."
**ADR Governing Implementation**: N/A (minimal)
**ADR Version**: N/A

**Engine**: vanilla three.js web build | **Risk**: MED (rewrites the combat input contract)
**Engine Notes**: none

**Root cause (measured, `src/combat.js` pre-change):** WASD were world-axis strafe (L107–110) and
heading was *derived from velocity* (`C.heading = atan2(vel.x, vel.z)`) with the chase camera
slaved to the nose — pressing W slid the ship world-north, the nose snapped ~180°, and the view
yanked with it. The player never commanded a turn; the ship faced wherever it drifted.

**Control decisions (user-confirmed 2026-11-03):** mouse also steers (pointer offset from center);
flight stays on the flat arena plane (no pitch); S beats W; boost modifies W's ceiling only.

---

## Acceptance Criteria

- [ ] Hold W → ship accelerates to ≥14 u/s and the nose does not move (|Δheading| < 0.2 rad).
- [ ] Release all throttle keys → speed holds (cruise, ±2 u/s over 0.5 s).
- [ ] Hold S → speed brakes to ≤3 u/s; S wins over W when both are held.
- [ ] Hold A (no W) → heading increases ≥0.5 rad with <3 u displacement (turn in place); D mirrors with the opposite sign.
- [ ] Pointer right of center (NDC +0.8) with no keys → heading decreases ≥0.5 rad in place; 0.08 deadzone at center.
- [ ] Space/Shift without W does nothing and does not drain the boost meter; releasing boost above cruise bleeds speed back down.
- [ ] A/D + pointer summed turn command clamped at 1.25× TURN_RATE.
- [ ] Full flow-check green, `CONSOLE []`.

---

## Implementation Notes

- `steer()` rewritten (`src/combat.js`): commanded yaw (`heading += turn·TURN_RATE·dt`) + throttle
  state (`C.speed`), `vel = forward·speed` — the velocity→heading dependency is deleted, not
  patched. Turn rate 2.2 rad/s, ACCEL 14, BRAKE 22 u/s².
- **Sign derivation, not hand-picking:** chase-cam screen-right at heading 0 is world −x (camera
  basis x = up × (−forward)), so A → +Δh, D → −Δh; pointer-right steers negative. Confirmed
  empirically by the probes (A +1.36, mouse-right −1.08).
- Bank now reads the commanded turn (`−turn·0.7`, clamped ±0.7) — same visual sign as the old
  left-turn lean.
- Deleted (made unreachable by this change): kb target-point branch, mouse ray-plane steering
  branch, pursuit-lerp block, velocity→heading line, old boost `distanceTo > 1.5` condition.
- Probe surface: `combatState()` gained `speed` and `heading` (pos existed since story-003).
- Camera block untouched: `vel.length() === speed`, so story-002's velocity trail stays valid.

## Out of Scope

- Vertical flight / pitch (arena is a flat plane by design decision).
- Reverse thrust (S stops at 0).
- Boundary shape — the hard square clamp remains until [story 005].
- Enemy AI, weapon balance, audio.

---

## Files

- `src/combat.js` (steer rewrite, consts, C.speed, probe fields)
- `src/main.js` (CONTROLS panel text), `tools/index.template.html` (hint bar text)
- `tools/flow-check.mjs` (probe rewrite), `design/game-brief.md` (control description)

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; the flow-check probes are the acceptance evidence.*

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: mutation run + green run.

**Status**: [x] Created — `production/qa/evidence/story-004-nms-controls/mutation-run-old-build.md`
records the probe set running against the OLD build first: **9 reds, each for the stated mechanism**
(W flipped Δh=3.14; S left speed 17; A/D strafed 8.6/6.3 u with inverted signs; mouse translated;
cruise decayed 16.6). On the new build: **flow-check 22/22 PASS** — W holds the nose Δh=0.00,
S brakes to 0.0, A/D turn in place ±1.36/−1.32 at d=0.0, mouse steers −1.08, cruise Δs=0.0,
`CONSOLE []`.

---

## Dependencies

- Depends on: [story 002] (whose strafe scheme this replaces) + [story 003] (the harness)
- Unlocks: [story 005] (soft circular boundary — the square clamp interacts with the throttle model)

---

## Completion Notes (story-done, 2026-11-03)

- All ACs verified by the flow-check probes quoted above. The mutation run also **corrected one
  prediction**: "rim slides" was expected green-on-old but measured red (d=2.1 — the old code pins
  dead at the square corner rather than sliding); the boundary probes that prove the new rim
  behavior ship with story-005.
