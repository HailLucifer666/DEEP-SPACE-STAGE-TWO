# ASSUMPTIONS — Stage 3

All five items below are **resolutions-pending-player**; each carries the lead-programmer
recommendation so the stage can proceed on the recommendation unless the player overrides
at the next session open or the stage-3 close review.

- **(a) Pitch envelope: 72°, no loop** — the ship can never pitch past ±72°, so it can never
  loop; vertical maneuvering is a 144° cone in a world-up frame (GDD §5.1). Changing it
  requires a design-level reopen (quaternion orientation + ship-local camera up — a rewrite
  of the story-004 heading-owned contract), not a tuning knob. **Recommendation: accept** —
  it is the deliberate story-004 simplification extended one axis, it keeps the chase camera
  well-conditioned (lateral basis ≥ 0.31 at max pitch), and it keeps the horizon readable
  ("controls that FEEL right" pillar).
- **(b) Pointer-Y pitch direction: DIRECT** — pointer above center = nose up (GDD §3.1),
  matching the shipped yaw convention (pointer right steers right) and NMS's default.
  `PITCH_INVERT = false` const ships as a one-line escape hatch if playtesting says a slice
  of players expects inverted. **Recommendation: direct.**
- **(c) SPD keeps showing COMMANDED speed** — the combat `SPD` readout keeps writing
  `C.speed` (the throttle state), not |vel|; with drift the actual motion diverges from it,
  and the camera trail + `combatState().velMag` (new in 015, harness-facing) show true
  speed. Keeps TD-014's contract ("the SPD line is combat's write") and story-010's writer
  shape intact; the semantic flip to |vel| is a one-line change reserved as the player's
  call (GDD §3.7, §8 decision 2). **Recommendation: keep commanded speed.**
- **(d) Stage 3 merge grant — open question**: machine-gate merges with look/feel review at
  stage close (the Stage-2 pattern: merges/tags on build + dep-check + flow-check + story
  probes + evidence on disk, player review collected once at stage close, revocable at any
  tag) **vs** per-story player verdict before each merge (AskUserQuestion per story).
  **Recommendation: the Stage-2 pattern** — it kept stage-2 moving at one slice per session
  with the full review still landing, and Stage 3's look/feel surface (pitch feel, drift
  weight, arena readability) is best judged as a whole, not per-slice. The PROGRESS method
  block is written to the recommendation; if the player picks per-story verdicts, insert
  the AskUserQuestion step before each merge and nothing else changes.
- **(e) Two open optional tuning items riding Stage 3** (from the stage-2 independent
  review; both are balance/polish, neither blocks any story):
  - **Boss inner-ring gap** — stage-2 review NIT 11: rides Stage 3 balance IF the player
    flags it in the stage-close look/feel review; the boss dash-shell clamp (story-016) is
    the only boss change otherwise.
  - **Drone-vs-drone separation tuning** — the orbit rings of multiple drones can overlap;
    no steering rewrite is planned (story-012's contract: retune, never rewrite). Rides
    Stage 3 balance only if flagged. The optional `DRONE_SHELL_CLAMP` knob (GDD §7) stays
    OFF for the same reason.

## Standing assumptions (not pending)

- The GDD is the design source of record — stories implement it faithfully; no redesign
  during implementation. Spec ambiguities surface as orchestrator questions, not guesses.
- The harness is `tools/flow-check.mjs` (GDD §5.6 notes `build/flow-check.mjs` does not
  exist). The 76-assert baseline is never re-numbered; the only sanctioned semantics changes
  are 016's two pre-declared flagged re-derivations (probes 7/7b/8 r → r3; band-assert
  retirement).
- The hint bar's current text in `tools/index.template.html` is UNVERIFIED (GDD §3.1) — the
  015 implementer reads it before editing; the added line is "R / F or MOUSE ↕ — pitch" in
  both places the controls text lives.
- Baseline figures (2026-11-05): master bd79b79, tag good-2026-11-05-c, flow-check 76/76,
  stage-2 GATE PASS.
