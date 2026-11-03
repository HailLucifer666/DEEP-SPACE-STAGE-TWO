# Story 005: soft circular boundary (the rim)

> **Epic**: combat-feel-fix
> **Status**: Complete
> **Layer**: Logic/Feel
> **Type**: Logic
> **Estimate**: S
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-03

## Context

**GDD**: `design/game-brief.md` (MVP 2 — arena; MVP 4 — controls that FEEL right)
**Requirement**: Live player report (second occurrence of the class): "you need to fix the radius
where the ship can actually fly — it gets stuck on the edges."
**ADR Governing Implementation**: N/A (minimal)

**Root cause (measured):** the arena clamp was a hard invisible SQUARE (`|x|,|z| ≤ 80`,
per-frame position clamp) — the "stuck at the edge" report had already caused one 3× enlargement
without touching the class. Position was clamped but velocity still pointed outward: the ship
pinned at full thrust over the streaming ground, with only a text warning after contact. Diagonal,
the corner sat 113 u out, so the boundary wasn't even a consistent distance. Mutation-run probe
numbers: diagonal flight reached **r=101.2**, rim carry **d=2.1** (hard pin, no slide).

**Design decision:** circular boundary — inside R_SOFT=60 untouched; 60→80 the outward radial
speed bleeds (tangential preserved → the ship slides along the rim instead of pinning); a visible
additive ground ring fades in from R_SOFT; `#warn` ("EDGE OF SECTOR") fires entering the soft zone,
not after contact. Raiders spawn 55 off the player, so R_HARD=80 keeps the spawn ring off-camera.

---

## Acceptance Criteria

- [ ] The hard clamp is a circle: outward flight (including diagonal) never exceeds r=81.
- [ ] Radial speed bleeds inside the soft ring (≤13 u/s measured across r 65–78; old build: 29.8).
- [ ] The rim slides: at the rim, oblique heading + W carries the ship >5 u in 1.6 s (no pin).
- [ ] The rim is visible before contact (additive ground ring, opacity ∝ proximity) and `#warn`
      fires entering the soft zone.
- [ ] Full flow-check green, `CONSOLE []`.

---

## Implementation Notes

- `steer()` (`src/combat.js`): before integration, the outward radial velocity component is bled
  to `max(3, MAX_SPEED·(R_HARD−r)/(R_HARD−R_SOFT))`; after integration, position is scaled back to
  the circle if past R_HARD. **The floor of 3 u/s is load-bearing:** the pure linear cap is
  asymptotic (dr/dt ∝ (R_HARD−r)) — measured on the real build, the ship crept 79.06 → 78.67 →
  78.11 holding W at full throttle, which is the same "stuck" feel in softer clothing. With the
  floor the ship arrives at the visible ring in bounded time and holds there; any turn slides it
  free (probe: 27.2 u carry).
- The ring is created once in `enterCombat` (idempotent `C.rim`), `RingGeometry(R_HARD±0.8)` on the
  arena plane +0.5, additive/transparent/depthWrite:false — the simple sibling of the rift planes;
  opacity driven per-frame by proximity, reset in `clearCombat`.
- `enterCombat` resets `C.speed = 0` (new throttle state from story-004) — a replay session must
  not inherit cruise speed.
- Boost observation from the measurement probe (pre-existing design, unchanged): the meter drains
  0.45/s → a full meter is a ~2 s burst (1.0→0.12), then boost disengages at the 0.12 gate.

## Out of Scope

- Boost budget/balance; vertical flight; enemy behavior near the rim.

---

## Files

- `src/combat.js` (consts, steer boundary block, rim ring, enterCombat/clearCombat resets)
- `tools/flow-check.mjs` (boundary probes 7/7b/8)

---

## QA Test Cases

*N/A — flow-check probes are the acceptance evidence.*

---

## Test Evidence

**Status**: [x] Created — mutation reds recorded in
`production/qa/evidence/story-004-nms-controls/mutation-run-old-build.md` (r=101.2, maxRadial=29.8,
pin d=2.1 — all from the OLD build). New build: **flow-check 25/25 PASS** — bleed maxRadial=9.8
(8 rim samples), circle r bounded, rim carry d=27.2, `CONSOLE []`.

---

## Dependencies

- Depends on: [story 004] (throttle model the bleed interacts with; probes share the harness)
- Unlocks: None

---

## Completion Notes (story-done, 2026-11-03)

- The asymptotic-cap defect was found by measurement (tmp boost probe, deleted after use), not by
  review — the first shipped version of the cap would have re-created the "stuck" feel gradually.
  The floor is pinned by the rim-slide probe staying green.
