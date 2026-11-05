# Story 019: elite enemies, per-wave composition tables, balance telemetry, boss reward

> **Epic**: combat-feel-fix (Stage 4 — balance + telemetry)
> **Status**: Pending — scope LOCKED and recorded 2026-11-05 before any Stage 4 code (the conversation-only gate)
> **Layer**: Logic
> **Type**: Logic
> **Estimate**: M
> **Last Updated**: 2026-11-05

## Provenance — the Stage 4 gate (same record as story-018)

Locked in conversation (2026-11-04/05) and written down 2026-11-05 before any Stage 4 code:
this story's four components, and the boss-reward value — **1000 flat**. The victory card
currently reads `SCORE — 0` in the victory scenario because the boss death awards nothing:
`src/combat.js` L329 — "slow-mo death cinematic inside boss.js — no score/kills
side-effects (spec is silent)". The card reads `cs.score` at the victory frame
(`src/phases.js` L103-105). The player's decision: defeating the boss awards a flat 1000.

## Goal

1. **Boss reward — 1000 flat (LOCKED VALUE)**: `bossDefeated` awards `C.score += SCORE_BOSS`
   with `SCORE_BOSS = 1000` as a named const in the score-constants block
   (`src/combat.js` L62-66) — not a magic number. Exactly once, before the victory frame
   freezes the score. Ordering constraint: the award lands in the boss death path BEFORE the
   card reads it; the `victoryFired` re-fire guard (`src/combat.js` L365, story-014 review
   finding 3 class) is the pattern — the award must be re-fire-safe exactly like
   `bossDefeated` reporting (the bossProbe `reports=1` assert).
2. **Elite variants** (inherited from `one-shot-work/HANDOFF.md` L226, written 2026-11-03):
   for wave ≥ 4, each spawn rolls an elite chance (0.22); elite = scale ×1.35, emissive
   retint `0xffa02f`, HP ×3, speed ×1.15, score ×2. The CHANCE is derived from the wave
   number — no hand-written elite lists (acceptance #18 holds for elites).
3. **Per-wave composition tables** (deferred to this story by story-012 L35: "the pure
   formula in enemies.js is untouched — per-wave tables are story-019"): enemy composition
   per wave becomes table-driven for the early waves; the derived formulas remain the
   fallback beyond the table's end. The acceptance-#18 tension is resolved explicitly: a
   table is design data under review, not a hand-kept selector in a guard — the
   table↔derivation boundary is stated in the `src/enemies.js` header and pinned by an
   assert on the boundary wave.
4. **Balance telemetry** (the stage's namesake): per-run combat stats recorded as tuning
   evidence — kills by kind, shots fired / hits (accuracy), damage taken by source, wave
   reached, score by source, powerups picked, fight duration. Readable via
   `window.__stage2` (combatState extension or a telemetry dump). Player-facing UI
   unchanged — telemetry is a tuning surface, not a feature. Purpose: wave-table and
   knob retunes happen from evidence, not vibes.

## Scope

- `src/combat.js` — `SCORE_BOSS` const + the award in the bossDefeated path; telemetry
  accumulator zeroed in `enterCombat` beside score/kills (`src/combat.js` L453 pattern).
- `src/enemies.js` — elite variants + composition tables (+ the header boundary note).
- `src/probes.js` — telemetry exposed for the harness.
- `src/boss.js` — ONLY the award call site (the death path already reports `bossDefeated`
  exactly once); zero behavior change otherwise.
- `tools/flow-check.mjs` — new asserts (red-first, below).

## Non-goals

- No wave-count/speed formula retune beyond the composition tables — evidence-driven
  retunes are a follow-up that READS this story's telemetry.
- No new enemy kinds — elite is a variant of existing kinds; which kinds can be elite is a
  GDD decision stated in the table.
- No HUD changes (telemetry is harness-side; the death/victory cards already read
  `cs.score` — `src/phases.js` L82/L105 — so the reward shows with zero card edits).
- No difficulty rebalancing "while we're in there" — the tables' numbers come from the GDD.
- Launch phases untouched.

## Acceptance criteria

- [ ] Boss reward: the victory probe reads final score = (pre-boss score) + 1000 exactly;
      `bossDefeated` still reports exactly once (`reports=1`); a forced second victory
      trigger never double-awards; re-entry after victory (restart class) starts at
      score 0.
- [ ] High-score path: the +1000 writes through `writeHighscore` (`src/phases.js` L104) —
      probe persists, reloads, reads back (store.js guard intact).
- [ ] Elites: probe forces wave ≥ 4 with seeded RNG → the elite rate matches the GDD
      chance over N spawns; each elite stat (HP ×3 / speed ×1.15 / score ×2 / tint /
      scale) asserted via probe fields; wave < 4 produces zero elites.
- [ ] Tables: composition for waves 1..N matches the GDD table exactly (assert per wave);
      waves beyond the boundary use the derived fallback (asserted BOTH ways at the
      boundary); `src/enemies.js` header states the boundary.
- [ ] Telemetry: a scripted probe run reports every field with sane values (counts match
      the probe's own actions; no NaN/undefined); the accumulator is zeroed on
      `enterCombat` (restartProbe parity).
- [ ] Full flow-check green (114 + new), `CONSOLE []` per page; boot-marks inside the
      documented band; dep-check acyclic, main.js ≤ 500.

## Test plan (red-first)

- **The boss-award red IS the decision's proof**: on the current build the victory probe
  reads `SCORE — 0`; the new assert fails on the old build for exactly that reason.
  Recorded as the red-on-019 artifact before any change lands.
- **Re-fire probe**: force the completion path twice (bossProbe extension) → the score
  increases exactly once.
- **Elite RNG**: seeded; mutations (chance → 0 → RED; tint removed → RED) recorded with
  dates + adjacent keep-passing cases.
- **Telemetry**: one scripted kill → kills-by-kind +1 and the accuracy arithmetic checks;
  mutation "forget to zero on enterCombat" → RED via the restartProbe parity assert.

## Files touched

- `src/combat.js`, `src/enemies.js`, `src/boss.js` (award call site only), `src/probes.js`,
  `tools/flow-check.mjs`.
- `production/qa/evidence/story-019-elites-waves-telemetry/` — report + red/mutation
  outputs.
- **NOT touched**: `src/launch.js`, `src/main.js` (zero-diff), `src/audio.js`,
  `src/phases.js` (the card already reads `cs.score`).

## Risks

- **The #18 tension (tables vs derived)**: the boundary is a decision, not a drift — the
  `enemies.js` header carries it; the spec reviewer verifies the boundary assert exists.
- **Boss-award ordering**: the award must not land after the card freezes its score
  (victoryFired class) — the probe pins the same-frame visibility.
- **Elite × table interaction**: a table row of "2 gunners" with elites rolling per spawn
  yields 2 × HP×3 sponges — the GDD states whether table counts are pre- or post-elite.
- **Telemetry cost**: event-driven counters only (kill/hit/damage), never per-frame
  allocations in the render loop.

## Unlocks

- Stage 5 (story-020 settings persistence + README/deploy + host choice).
- The evidence-driven balance pass (future polish item) reads this story's telemetry.
