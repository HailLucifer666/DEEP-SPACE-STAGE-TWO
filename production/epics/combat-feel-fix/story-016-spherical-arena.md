# Story 016: spherical arena — the disc becomes a volume

> **Epic**: combat-feel-fix (Stage 3 — full 3D flight)
> **Status**: Pending
> **Layer**: Logic/Feel
> **Type**: Logic
> **Estimate**: M
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-05

## Goal

Replace the flat disc boundary with a soft spherical arena centered on the spawn point —
`O = (0, ARENA_Y, 0)`, soft shell from `R_SOFT = 60`, hard at `R_HARD = 80` — the SAME
numbers as the flat rim (combat.js L25), so crossing times and the spawn-ring math are
unchanged, and the SAME bleed feel as story-005: radial speed capped (floor 3 u/s, the
load-bearing anti-mud floor), tangential preserved (slide along the shell, never pin).

Two named sub-items ride in scope:

- **The 015 band scaffold is DELETED here** — `BAND_H/BAND_HH`, the band bleed block, and
  the three 015 band asserts. The retirement is stated in the harness comment and the
  programmer report — a FLAGGED semantics change, never a quiet edit (GDD §3.4, §5.5).
- **The boss dash shell clamp — ONE line** (GDD §5.3): the charge dash overshoots 10 u past
  its captured target (`OVERSHOOT`, boss.js L49); a player hugging the shell could bait a
  dash that exits the sphere. Clamp the captured `dashTarget` radially to
  `r3 ≤ R_HARD − OVERSHOOT − 2 = 68` inside `launchDash` (boss.js L164-176). The dash stays
  inside, the overshoot stays honest, the state machine is otherwise untouched.

Design source: `design/gdd/full-3d-flight.md` §3.5, §4.4–4.5, §5.3–5.4.

## Scope

- `src/combat.js`:
  - Boundary math goes 3D: `r3 = |pos − O|`, outward normal `n = (pos − O)/r3`; the radial
    component of vel (`vel · n`) capped at `max(3, MAX_SPEED · (R_HARD − r3) /
    (R_HARD − R_SOFT))` — story-005's formula with the 3D normal, tangential preserved
    (subtract only the excess along n). Worked example: at r3 = 70 the outward cap is
    8.5 u/s; the soft shell is 20 u thick → 1.2 s to cross at cruise 17, 0.62 s at boost
    32.3 (GDD §4.4).
  - Hard clamp: past `R_HARD`, scale `pos − O` back to the shell — the `r > R_HARD` block
    (L202-208) gains its y term.
  - Per-frame ordering unchanged and load-bearing (§4.5): drift alignment → boundary bleed →
    position integration → hard clamp. Because the bleed runs after alignment, the boundary
    wins within one frame and the equilibrium radial speed equals cap(r3) — the rim-slide
    feel is preserved exactly.
  - Band scaffold deleted: `BAND_H`/`BAND_HH` consts, the band bleed block, the band branch
    of the `#warn` driver.
  - `#warn` ("EDGE OF SECTOR") fires entering the soft shell (r3 > 60) and clears inside it.
  - Rim ring stays at the equator as the ground reference; its opacity driver (L213)
    switches from 2D proximity to 3D proximity.
  - Boundary probe rewrite: the story-005 probes (7/7b/8) measure `r3` instead of
    `hypot(x,z)`; the sphere walk adds a pitched-clamp drive (sustained climb + W + boost).
  - A faint full shell SURFACE is story-017 polish, NOT here — 016 changes the math, 017
    changes the look (GDD §3.5).
- `src/boss.js`: the ONE line — `dashTarget` radial clamp to 68 in `launchDash` (L164-176).
  Volley bolts stay flat (`dir.y = 0`, L155): the boss's altitude-follow (rate 3/s, L323)
  converges onto the player's altitude in ~1 s, so flat bolts remain threatening; climbing
  dodges volleys but NOT the charge (which climbs with you) — the intended anti-camp balance.
- `tools/flow-check.mjs`: sphere asserts, the flagged re-derivation of probes 7/7b/8, the
  band-assert retirement record.

## Non-goals

- **No boundary visual in this story** — the shell surface is story-017 (math here, look
  there, per GDD §3.5).
- Boss state machine untouched beyond the one clamp line: phase thresholds, weak point, slow
  -mo death, orbit/altitude-follow behavior all keep (GDD §3.7 verdict: Keep).
- Drone steering untouched — drones are EXEMPT from the boundary (they orbit the player at
  r 12-20, drone.js L27-28, so a player at the shell puts ring points up to ~100 u from O;
  the ~20 u overshoot is documented accepted behavior — additive sprites, no wall to clip).
  The optional `DRONE_SHELL_CLAMP` knob stays OFF unless playtesting objects (GDD §5.4).
- Victory, audio, launch phases untouched.
- Raider spawn ring unchanged — raiders spawn 55 off the player (enemies.js L84), already
  able to spawn outside the flat boundary and fly in (pre-existing accepted behavior);
  unchanged in the sphere.
- No re-tune of R_SOFT/R_HARD values (±20% is the tuning range, GDD §7 — not exercised here;
  the same numbers keep story-005 crossing times).

## Implementation notes

- `R_SOFT/R_HARD` keep their values; their MEANING widens from disc radius to sphere radius
  (GDD §5.5 disposition table). `ARENA_Y = 18` is re-anchored as the sphere center's y — the
  camera look-pin to it was already removed in story-015; it stops being a floor.
- Raider plane decision (architecture risk R6) was RESOLVED by story-015: raiders follow the
  player's altitude exponentially (`RAIDER_ALT_FOLLOW = 1.2/s`) — this story re-verifies that
  decision inside the sphere and records it; no per-enemy frame mixing (orb scans are
  full-3D, raider scans went 3D in 015).
- restartProbe contract: no new geometry in this story; the rim ring's lifecycle is
  unchanged; baseline entities count must not drift from the story-015 close number.
- Bloom: no new visuals here — the R8 shell-wash risk lands in story-017, not this one.

## Acceptance criteria

- [ ] Ship position never exceeds r3 = 81 from O under ANY input combination, including
      pitched flight at boost (hard clamp); the soft force engages at r3 > 60.
- [ ] Radial speed bleeds inside the soft shell: ≤ 13 u/s measured across r3 65-78 while
      holding W outward (story-005's measured parity, 8-shell-sample analog).
- [ ] The shell slides: at r3 = 79 with oblique heading + W, the ship carries > 5 u along
      the shell in 1.6 s (no pin — story-005 rim-slide in 3D).
- [ ] `#warn` fires entering the soft shell and clears inside it; equator rim ring opacity
      tracks 3D proximity (0 at r3 ≤ 60, > 0 at r3 ≥ 78).
- [ ] Boss dash guard: with the player parked at r3 = 78 during the charge phase, every
      captured `dashTarget` satisfies r3(dashTarget) ≤ 68; the boss never exceeds r3 =
      80 + OVERSHOOT tolerance (92) mid-dash and re-orbits inside.
- [ ] Drones remain functional in the sphere: `?droneProbe=1` still reports yRange > 1,
      all-axes path3d, telegraph/dive true (story-012 keep-passing — zero steering changes).
- [ ] The 015 band asserts are REMOVED and the removal is stated in the story report and the
      harness comment (no silent retirement); `BAND_H`/`BAND_HH` consts deleted.
- [ ] Full flow-check green, per-page `CONSOLE []`; restartProbe clean (restart baseline
      includes no new allocations).

## Test plan (red-first)

Harness: `tools/flow-check.mjs` — same grammar; the sphere asserts extend the existing
boundary walk (key-driven, no new probe flag needed — the asserts read `combatState().pos`
and compute r3 in-harness; the boss-dash asserts ride the `?bossProbe=1` page drive).

- **Red-on-015 record (before any product change)**: run the harness with the sphere asserts
  against the story-015 close build. The hard-clamp assert records red FOR REAL: the flat
  build clamps XZ radius at 80 while the band caps |y − 18| at 20, so pitched boost flight
  reaches r3 ≈ hypot(80, 38) ≈ 88 > 81. The rim-opacity assert red (2D driver — a ship above
  the plane near the equator ring reads 0 opacity at r3 ≥ 78), the shell `#warn` assert red
  (band grammar), the dash-clamp assert red (boss.js has no clamp). Record as
  `flow-red-015.txt` with reasons inline.
- **Flagged semantics change — probes 7/7b/8 re-derived, never quietly edited**: the three
  story-005 boundary asserts keep their thresholds (bleed ≤ 13 u/s, circle r ≤ 81, rim slide
  > 5 u over 1.6 s) but their measurement goes from `hypot(x, z)` to the 3D radius. The
  re-derivation is red-first: run the re-derived asserts on the PRE-016 branch build, record
  which fail and why (the r3 measurement is what lets the pitched-clamp case discriminate),
  and state the change in the harness comment block AND the programmer report. The old 2D
  assert text is replaced, not left alongside (dead asserts lie).
- **Band retirement (explicit)**: the three story-015 band asserts (band holds ≤ 20.5,
  band vertical speed ≤ 13, #warn outside the band) are deleted in the same change that
  deletes `BAND_H/BAND_HH`. The harness comment names them, dates the retirement
  (2026-11-05 or the actual merge date), and points at story-015's record; the programmer
  report repeats it. Flagged semantics change — never a quiet edit.
- **New asserts (5) + re-derived (3) — named, expected numbers from GDD §8.2:**
  1. `boundary is a sphere (r3 ≤ 81)` — re-derived probe 7b, 3D measurement.
  2. `soft shell bleeds radial speed in 3D (≤13, sampled r3 65-78)` — re-derived probe 7.
  3. `rim slides along the shell (carry >5u over 1.6s at r3 ≥ 72)` — re-derived probe 8.
  4. `hard clamp under pitched boost (r3 ≤ 81)` — sustained climb + W + boost drive.
  5. `#warn fires entering the soft shell and clears inside` — r3 60 boundary crossing.
  6. `rim ring opacity tracks 3D proximity` — 0 at r3 ≤ 60, > 0 at r3 ≥ 78.
  7. `boss dashTarget clamped inside the shell` — player parked at r3 = 78 during charge;
     every captured dashTarget r3 ≤ 68.
  8. `boss stays inside mid-dash and re-orbits` — never exceeds r3 = 92 (80 + OVERSHOOT
     tolerance), orbit position resumes inside.
- **Mutation probes** (mutation + date in the test file; mutate → `npm run build` → full
  flow-check → restore; verify the mutation applied by reading its red output before
  recording):
  1. `R_HARD 80 → 90` (2026-11-05) → RED asserts 1 and 4 (r3 reaches 88+ legally). Adjacent
     keep-passing: the rim-slide assert stays green.
  2. `boundary floor 3 → 0` (2026-11-05) → RED assert 2 (pure linear cap is asymptotic —
     radial speed decays toward 0 and the ship reads stuck; story-005's own finding, now
     proven in 3D). Adjacent keep-passing: assert 1 stays green.
  3. `boss.js dash clamp line removed` (2026-11-05) → RED assert 7 (a dashTarget captured at
     r3 78 exits). Adjacent keep-passing: `bossProbe phases in order` stays green — the
     mutation touches geometry, not the state machine.
  4. `tangential preservation removed` (zero the full radial component instead of the
     excess, 2026-11-05) → RED assert 3 (ship pins at the shell). Adjacent keep-passing:
     assert 2 stays green (the cap itself is untouched).
- **Keep-passing (existing asserts, unchanged)**: the story-004 movement block, the ENTIRE
  story-012 droneProbe block (yRange > 1, path3d, telegraph, wave rules — the R6/R5 watch:
  zero steering changes), the ENTIRE story-013 bossProbe block (phases in order, 3× weak
  ratio, overshoot, slow-mo, HUD line — any hold-range change would re-prove these
  red-first), the story-014 victory block, and the story-015 pitchProbe block MINUS the
  retired band asserts. The 015 movement asserts that sampled `hypot(x, z)` implicitly
  (circle-radius, band) were sized for this handoff in 015's plan.
- **kee discipline**: No merge without the red-first record; a mutation that silently fails
  looks exactly like a guard that works — diff the mutation.

## Files touched (pre-authorized — exactly the GDD §6 list)

- `src/combat.js` — bleed/clamp blocks go 3D, band scaffold deleted, rim opacity 3D,
  #warn shell trigger, boundary probe rewrite.
- `src/boss.js` — the ONE added line: `dashTarget` shell clamp (§5.3).
- `tools/flow-check.mjs` — sphere asserts, probes 7/7b/8 re-derived (flagged), 015 band
  asserts retired (flagged).
- `production/qa/evidence/story-016-spherical-arena/` — report + red/mutation outputs +
  screenshot.

## Risks

- **R4 (architecture) — spherical boundary rewrite**: the floor of 3 u/s is load-bearing
  (story-005: the pure linear cap is asymptotic and re-creates the "stuck" feel) — mutation
  2 above proves it in 3D. The raider spawn ring (55 off) must map onto/inside the sphere —
  it already can spawn outside and fly in (accepted); re-verify with the wave asserts.
- **R5 (architecture) — boss plane-hugging patterns vs the sphere**: the bossProbe asserts
  are keep-passing; the ONE line is the only boss change. If any boss hold-range needs
  re-scaling during implementation, that is a red-first re-derivation with a flagged
  decision, not a quiet knob turn.
- **R6 (architecture) — raider plane decision**: resolved by story-015's altitude-follow;
  recorded here, re-verified in the sphere (raider mean-y assert from 015 stays green at
  high-altitude player positions).
- **R3 carry-over — dt-scaling**: the 3D cap uses the same exp-free clamp form as the flat
  rim (stateless per-frame cap) — no new integrator, no new frame-rate risk.

## Unlocks

- story-017 requires only `O`/`R_HARD` (its shell visual and ambient field seat against the
  finished sphere).
- Stage-3 close: the review/smoke/GATE sequence and the §8.4 experiential gate (vertical
  dodge readability) become meaningful once the volume exists.
