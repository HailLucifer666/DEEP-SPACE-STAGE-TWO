# EPIC — flight-v2 (Stage 7)

**Goal:** NMS-class flight feel + an open world container, no new assets, no engine swap.
**Authority:** `one-shot-work/STAGE-7-FLIGHT-V2.md` (read it FIRST — it owns the feel
contract, the laws, the harness migration map, and the owner decisions D-7.1/D-7.2).
**Order:** 7.0 → 7.1 → 7.2 → 7.3 → 7.4 → 7.5. One story per session. Every boundary
shippable + taggable (`good-<date>-s7-<n>`).

| Story | Card | Status |
|---|---|---|
| 7.0 feel baseline + flightProbe scaffold | story-7.0-feel-baseline.md | DONE 2026-11-09 — baseline {pitchMax 1.2566, rollTwist 0, slip 25.06°, fov 62/62, camLag 0.798, maxR3 80}; 4 old-model asserts green-on-old (the 7.1/7.3 red targets); battery 255/0 |
| 7.1 flight body (6DOF + camera v2) | story-7.1-flight-body.md | TODO |
| 7.2 inertia + FA toggle + strafe | story-7.2-inertia-fa.md | TODO |
| 7.3 open space + pulse drive | (write at 7.2 close, from spec §4) | TODO |
| 7.4 heat encounters | (write at 7.3 close) | TODO |
| 7.5 scan/discover/upgrade | (write at 7.4 close) | TODO |

**Standing verification gate (every story):** `npm run build` → `tools/dep-check.mjs` →
`tools/flow-check.mjs` → `tools/boot-marks.mjs headed` → the story's probe. Red-first with
recorded mutations; `CONSOLE []` on every page; assert-count deltas explained in the report.
