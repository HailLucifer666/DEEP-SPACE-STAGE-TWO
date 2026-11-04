# Story 015: pitch + drift — the keystone (full 3D flight begins)

> **Epic**: combat-feel-fix (Stage 3 — full 3D flight)
> **Status**: Pending
> **Layer**: Logic/Feel
> **Type**: Logic
> **Estimate**: L
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-05

## Goal

Turn the ship from a turret with a thruster into a ship in space. Two changes, one keystone:

1. **Pitch** — a second commanded rotation axis: R/F keys + pointer-Y (DIRECT convention:
   pointer above center = nose up), mirroring story-004's yaw grammar exactly (deadzone 0.08,
   1.25× combined clamp), clamped to a ±72° envelope. No loops, ever — changing that requires
   a design-level reopen, not a tuning knob (GDD §5.1).
2. **Drift** — `vel` becomes persistent state that realigns toward the nose at
   `ALIGN_RATE = 4.5/s` instead of being recomputed as `forward · speed` every frame
   (combat.js L186).

Keystone: `forward()` goes 3D — `(sin h · cos φ, sin φ, cos h · cos φ)` — and every consumer
(ship velocity, player bolts, chase cam, probe spawns) gains the vertical component correctly
from that ONE change (GDD §3.0 table). Design source: `design/gdd/full-3d-flight.md`
§3.0–3.4, §4.1–4.3. The whole story is a retune of existing systems — the drone already
steers full-3D, `input.mouse.y` is already recorded and unused, zero `src/input.js` changes.

**Riding items (in scope by design, not extras):**

- **Raider altitude-follow retune** — raider steering is XZ-only and y never changes after
  spawn; once the collision scans go 3D, a player who climbs 40 u strands every raider below
  and trivializes the wave. One line per raider tick:
  `d.position.y += (playerPos.y − d.position.y) · (1 − exp(−RAIDER_ALT_FOLLOW · dt))`,
  `RAIDER_ALT_FOLLOW = 1.2/s` — the boss's own altitude-lerp pattern (boss.js L323) at
  quarter rate, so raiders trail altitude changes and staying mobile still buys windows of
  safety. GDD §5.4, the anti-camp hazard.
- **Three XZ-only collision scans go 3D** — enemy bolt × player hit (`enemies.js` L113-114,
  `dx² + dz² < 1.4`: a bolt 30 u above the ship would still "hit"), player bolt × raider
  (`src/combat.js` L239-253, `dx² + dz² < 1.1`), raider ram contact (`enemies.js` L179, XZ
  dist). Each converts to the full-3D squared-distance form already proven by the drone scan
  (`combat.js` L254-270). Raider `lookAt` stays yaw-only (visual only). GDD §5.4.
- **Temporary altitude band — explicitly a scaffold, deleted by story-016** — 015 ships
  pitch while the boundary is still the flat disc, so a soft vertical band
  `[ARENA_Y − 16, ARENA_Y + 16]` (hard ±20) with story-005's exact cap-and-floor feel (floor
  3 u/s, the load-bearing anti-mud floor) keeps the player in the fight volume; `#warn`
  fires outside the band — same element, same grammar (combat.js L209-212). Story-016
  deletes the band and its asserts and STATES that retirement — never a quiet edit.
  GDD §3.4.

## Scope

- `src/combat.js`:
  - `C.pitch` state; `enterCombat` resets it to 0 next to heading/bank/speed (L547) — the
    replay-never-inherits-a-nose-up contract; `vel` already resets (L546).
  - `forward(out)` returns the 3D form (keystone, L153-155).
  - `steer()` gains, in this order (§4.5 — load-bearing): (1) pitch integration
    (`dφ/dt = pitchCmd · PITCH_RATE`, clamp ±PITCH_MAX), (2) drift alignment FIRST
    (`vel += (forward3D · speed − vel) · (1 − exp(−ALIGN_RATE · dt))`), (3) the boundary
    bleed, (4) position integration, (5) hard clamp. If alignment ever ran after the bleed
    it would undo the boundary's radial cap every frame.
  - Pose: `rotation.x = −φ` into the existing `YXZ` group (L88-93, L600-602); bank stays the
    innermost rotation, so the banking visual remains correct at any pitch.
  - Chase cam: the look-target y is UNPINNED from `ARENA_Y` → `pos.y + 4·sin φ` (L607 — the
    one line GDD §3.0 flags); the position formula survives as-is with the 3D forward and
    keeps its WORLD-up +3.4 (never inverts inside a 72° envelope).
  - Altitude band scaffold: `BAND_H = 16 / BAND_HH = 20`, story-005 cap/floor feel with the
    ±ŷ normal, `#warn` reuse (L209-212 grammar).
  - `combatState()` gains `pitch` and `velMag` (siblings of `speed`, L716) — story-016's
    asserts read them.
  - `?pitchProbe=1` deterministic drive (droneProbe pattern, L366-409) reporting
    `{ dPhi, slip, driftPath, boltRise, band }` on `window.__stage2` with `lastReport`
    parity.
  - Player-bolt × raider scan goes 3D (L239-253).
- `src/enemies.js`: enemy-bolt × player and raider-ram scans go 3D (L113-114, L179); the
  altitude-follow line in the raider tick; nothing else.
- `src/main.js` (`PANEL_HTML.CONTROLS`, L62-66) and `tools/index.template.html` (hint bar):
  one line each — "R / F or MOUSE ↕ — pitch". Both places the text lives (the "obvious
  controls" pillar). Hint-bar text location per story-004's file list; its current text is
  UNVERIFIED — read it during implementation.
- `tools/flow-check.mjs`: the pitchProbe assert block (22 new asserts — test plan below).

## Non-goals

- **No roll control, no loops, no strafing, no 6-DOF** — the anti-fantasy (GDD §2). The nose
  stays player-owned yaw + pitch in a world-up frame; the 144° vertical cone (±72°) is
  accepted.
- W/S throttle semantics untouched (cruise holds speed, S beats W, boost raises the ceiling
  only — the story-004 user-confirmed contract). ArrowUp/Down stay throttle aliases; they do
  NOT become pitch. Space/Shift boost, LMB fire untouched.
- Boss, victory, waves, audio untouched (the boss dash is already full-3D, boss.js L169; its
  sphere guard is story-016's one line; an engine-pitch shift with pitch rate is explicitly
  out of scope, GDD §3.7).
- Launch phases untouched — `src/launch.js` zero-diff.
- SPD readout semantics unchanged — it keeps showing `C.speed`, the COMMANDED speed (the
  §8 player decision, ASSUMPTIONS item c); `velMag` rides `combatState()` for the harness
  only.
- Rim ring visual unchanged (its 3D opacity driver is story-016; the shell visual is 017).

## Implementation notes

- **Command model** (mirrors yaw, combat.js L165-168): `pitchCmd = clamp(keyPitch +
  pointerPitch, −1.25, 1.25)`; pointer deadzone 0.08 NDC identical to the yaw deadzone
  (L166); `input.mouse.y` is already NDC-up-positive and unused (input.js L17, L55-59) —
  **zero input.js changes**. `PITCH_INVERT = false` const flips the pointer convention ONLY
  (keys unaffected) as a playtest escape hatch.
- **Numbers** (named constants in the owning module's header — project convention):
  `PITCH_RATE = 1.8 rad/s`, `PITCH_MAX = 1.2566 rad (72°)`, `PITCH_DEADZONE = 0.08`,
  `ALIGN_RATE = 4.5/s`, `RAIDER_ALT_FOLLOW = 1.2/s` (in enemies.js), `BAND_H = 16 /
  BAND_HH = 20`, band floor 3 u/s.
- **Drift semantics**: speed stays the throttle state (`C.speed`, story-004/005 semantics);
  steady state `vel → forward · speed` keeps cruise-hold and brake asserts meaningful. Slip
  at full turn β = 2·asin(2.2/9.0) ≈ 28°; recovery 95% in 3/ALIGN_RATE ≈ 0.67 s; measured
  full-turn path radius grows 7.7 u → 9-11 u — the drift tax the assert enforces. At speed 0
  drift is inert — the story-004 turn-in-place assert survives untouched (`enterCombat`
  resets speed to 0, L547; probe precondition, not luck).
- **Boost expiry order survives**: the R2-1 brake → expiry-bleed → accelerate order
  (L180-182) operates on `speed`, orthogonal to drift alignment.
- **Stale pointer**: the pointerleave/blur clears (input.js L67-70) cover pitch identically —
  same mouse state object; the story-004 pointer-leave assert is the guard.
- **Camera conditioning**: at φ = 72° the lookAt lateral basis magnitude is cos 72° ≈ 0.31 —
  well-conditioned; the 72° clamp IS the R1 up-vector mitigation. A world-up +3.4 camera
  offset never inverts because we never pitch past 72°.
- **scriptedKill probe bolt** spawns at `ARENA_Y` (L342) — still valid: pitch = 0 in its
  0.4-1.4 s window (combat-entry reset). Note it in the programmer report.
- **Death slow-mo**: pitch/drift run on scaled dt like everything else (L583 comment) — no
  special case. The victory card is unaffected (C.time, score).

## Acceptance criteria

- [ ] `?pitchProbe=1` reports `pitchProbe` on `window.__stage2` (droneProbe parity);
      `combatState()` exposes `pitch` and `velMag`.
- [ ] Holding R for 0.4 s at zero throttle changes pitch by 0.72 rad ± 0.05; heading change
      |Δh| < 0.02 in the same window (axes independent).
- [ ] Pointer at NDC y = +0.8, no keys → Δφ ≥ 0.5 rad in 1.0 s (direct: up = nose up); NDC
      −0.8 mirrors negative; pointer parked at |y| ≤ 0.08 → |Δφ| < 0.02 over 1.0 s
      (deadzone).
- [ ] Sustained R for 1.5 s → pitch == PITCH_MAX ± 2° and never exceeds it; F mirrors down.
- [ ] Drift: after a 1.0 s full yaw command at cruise (speed 17 ± 1), the angle between
      forward and vel is 20°-35° (slip present) and `velMag` ≥ 0.9 × speed.
- [ ] Drift recovery: 0.8 s after releasing the turn command, slip < 8°.
- [ ] Sustained full-turn circle at cruise traces radius 8.5-11.5 u (flat baseline 7.7,
      story-004 r2), sampled from `combatState().pos` over one full revolution.
- [ ] Bolt fired at φ ≈ 45° ± 5° rises > 5 u over 0.5 s while xz-speed ≈
      BOLT_SPEED · cos φ.
- [ ] Altitude band: flying straight up at full pitch + W, `|pos.y − 18|` never exceeds
      20.5; vertical speed ≤ 13 u/s measured in the 16-20 band (story-005 parity numbers);
      `#warn` visible when outside the band.
- [ ] Raider scans 3D: a raider spawned 20 u directly above a stationary ship produces no
      ram contact and no bolt hit within 2 s (the XZ-only build hits — that IS the red).
- [ ] Raider altitude-follow: player held at +30 altitude for 3 s → live raider mean y
      within 12 u of the player's.
- [ ] Keep-passing: the full story-004 movement set (turn-in-place < 3 u, cruise-hold ± 2
      u/s, S brakes ≤ 3 u/s, boost expiry bleed ≤ 25 u/s², pointer-leave stops steering)
      plus the story-005/012/013/014 blocks stay green unchanged.
- [ ] Full flow-check green (76 existing + new), per-page `CONSOLE []`; restartProbe clean;
      pitch resets to 0 on every `enterCombat`.
- [ ] Controls text updated in BOTH places (CONTROLS panel + hint bar); programmer report at
      `production/qa/evidence/story-015-pitch-drift/` with the red-first record + mutation
      outputs.

## Test plan (red-first)

Harness: `tools/flow-check.mjs` — `ok(name, cond, extra)` grammar, `J()`/`poll()` on
`window.__stage2`, per-page `CONSOLE []` asserts (the stage-2 review finding-2 pattern: each
page asserts its own console before the next navigate).

- **Red-on-master record (before any product change)**: run the harness with the new
  pitchProbe block against the stage-2 close build (master @ bd79b79). All probe-dependent
  asserts FAIL for the stated reason: no `?pitchProbe=1` handler exists, so
  `window.__stage2.pitchProbe` never appears and the deadline expires (each probe assert
  records its red from the null probe — the exact droneProbe/bossProbe red pattern);
  `combatState().pitch`/`velMag` are undefined; the band asserts red because y never leaves
  18; the elevated-raider assert red because the XZ-only scan "hits" through 20 u of pure
  vertical separation. Keep-passing asserts green by design. Record as
  `flow-red-master.txt`, reason inline in the harness comment.
- **New asserts (22) — named, expected numbers from GDD §8.1:**
  1. `pitchProbe reports (story-015)` — probe object present on `window.__stage2`.
  2. `combatState exposes pitch + velMag` — both numeric.
  3. `pitch resets to 0 on entry` — probe-page entry snapshot φ == 0.
  4. `R 0.4 s pitches 0.72 rad` — |Δφ − 0.72| ≤ 0.05 (PITCH_RATE 1.8 × 0.4 s).
  5. `pitch and yaw independent` — |Δh| < 0.02 during the R hold.
  6. `pointer up pitches up (direct)` — NDC y = +0.8 → Δφ ≥ 0.5 rad in 1.0 s.
  7. `pointer down mirrors` — NDC y = −0.8 → Δφ ≤ −0.5 rad.
  8. `pointer deadzone holds` — pointer parked at |y| = 0.05 → |Δφ| < 0.02 over 1.0 s.
  9. `pitch envelope clamps at 72°` — R held 1.5 s → φ = 1.2566 ± 0.035 rad, never above.
  10. `F pitches down` — mirror of assert 4.
  11. `drift slip present` — 1.0 s full yaw command at cruise → slip 20°-35°.
  12. `drift preserves magnitude` — velMag ≥ 0.9 × speed in the same window.
  13. `drift recovers` — slip < 8° at 0.8 s after release.
  14. `full-turn circle radius 8.5-11.5 u` — sampled from combatState().pos over one rev.
  15. `pitched bolt climbs` — φ ≈ 45° ± 5° → bolt y increases > 5 u over 0.5 s.
  16. `pitched bolt xz-speed honest` — ≈ BOLT_SPEED · cos φ (±10%).
  17. `altitude band holds` — sustained full-pitch climb + W → |y − 18| ≤ 20.5.
  18. `band vertical speed ≤ 13 u/s` — sampled in the 16-20 layer.
  19. `#warn fires outside the band` — visible when |y − 18| > 16.
  20. `raider scans 3D` — raider 20 u above a stationary ship: no ram contact, no bolt hit
      within 2 s.
  21. `raider altitude-follow` — player +30 u for 3 s → live raider mean y within 12 u.
  22. `CONSOLE [] (pitchProbe page)`.
- **Mutation probes** (each: mutation + date written in the test file comment; mutate →
  `npm run build` → full flow-check → restore; VERIFY the mutation actually applied by
  reading its red output before recording — a mutation that silently no-ops proves nothing):
  1. `PITCH_RATE 1.8 → 0.9` (2026-11-05) → RED assert 4 (Δφ ≈ 0.36). Adjacent keep-passing:
     assert 5 stays green — the mutation changes rate, not axis coupling.
  2. `ALIGN_RATE 4.5 → 99` (2026-11-05) → RED assert 11 (slip collapses < 1°; ≥ 99
     effectively disables drift, GDD §7). Adjacent keep-passing: assert 12 stays green.
  3. `enemies.js bolt×player scan back to XZ` (drop the dy² term, 2026-11-05) → RED assert
     20 (the elevated raider's bolts hit again — the exact anti-camp regression this story
     fixes). Adjacent keep-passing: assert 21 stays green.
  4. `RAIDER_ALT_FOLLOW 1.2 → 0` (2026-11-05) → RED assert 21. Adjacent keep-passing: the
     wave-1 raider-count assert stays green (spawn logic untouched).
  5. `band bleed cap removed` (2026-11-05) → RED asserts 17-18.
- **Keep-passing (existing asserts, unchanged)**: the story-004 movement block (W holds
  nose, cruise holds, S brakes, A/D turn in place, mouse steer, pointer-leave — flow-check
  L139-179), the story-005 boundary block (L182-235), story-012 drone asserts (L286-331),
  story-013 boss asserts (L333-388), story-014 victory asserts (L390-520). Any of these
  going red is a semantics regression, not a tuning matter — stop and re-derive red-first
  with a FLAGGED semantics decision (harness strategy, architecture §4).
- **kee discipline**: No merge without the red-first record; a mutation that silently fails
  looks exactly like a guard that works — diff the mutation.

## Files touched (pre-authorized — exactly the GDD §6 list)

- `src/combat.js` — pitch state, 3D forward, steer() pitch/drift/band, camera look-target,
  enterCombat reset, combatState fields, pitchProbe, player-bolt × raider 3D scan.
- `src/enemies.js` — two 3D collision scans + the altitude-follow line.
- `src/main.js` — `PANEL_HTML.CONTROLS` only (L62-66).
- `tools/index.template.html` — hint bar line only.
- `tools/flow-check.mjs` — pitchProbe block (22 asserts) + red/mutation records inline.
- `production/qa/evidence/story-015-pitch-drift/` — report + red/mutation outputs +
  screenshot.

## Risks

- **R1 (architecture) — camera up-vector at high pitch**: mitigated by the PITCH_MAX 72°
  clamp (lateral basis ≥ 0.31 at max pitch). The boss/probe horizontal lookAts (boss.js
  L307/L324) must be re-checked once the ship can be above/below them — read during
  implementation, no change expected.
- **R2 (architecture) — drift vs the throttle model**: `C.speed` stays the throttle scalar;
  SPD keeps showing it; `velMag` gives the harness true speed. The TD-011 regression class
  ("W flips the view") is guarded by the keep-passing `W holds the nose` assert.
- **R3 (architecture) — frame-rate independence**: drift is a PERSISTENT state — integrate
  dt-scaled under DT_CLAMP 0.05 with the exp form, never a per-frame multiplier. The harness
  measures wall-clock windows; the 015 assert tolerances above are sized for the drift build
  and the turn-in-place probe is speed-0 (drift inert).
- **Probe-spawn determinism**: probe entities spawn "ahead of the nose" assuming pitch = 0
  at combat entry — guaranteed by the reset contract (assert 3), documented in GDD §3.0.

## Unlocks

- story-016 requires `combatState().{pitch, velMag}` + the pitchProbe surface (its asserts
  read 3D radius + pitch), and owns deleting the band scaffold this story ships.
- story-016 spherical arena (the band → sphere handoff); the cross-story experiential gate
  (GDD §8.4) opens here — first-climb moment and controls text.
