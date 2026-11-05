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
   freezes the score. **Award site (TD-corrected 2026-11-05): the `bossApi.report`
   wrapper's `bossDefeated` branch in `src/combat.js` L130-141 — NOT `src/boss.js`.**
   boss.js is a declared pure signal source with no score access; boss.js importing
   combat.js would be a cycle. `src/boss.js` is ZERO-DIFF in this story. The award carries
   its own `C.bossAwarded` latch (the `victoryFired` pattern) so a forced second completion
   can never double-award. Ordering is already safe: the report wrapper runs inside
   `tickBoss` (L485) before `wavesTick` (L486), and `wavesTick` yields to `victoryFired`
   (L365) — no post-freeze bonus hazard (GDD §3.6).
2. **Elite variants** (inherited from `one-shot-work/HANDOFF.md` L226, written 2026-11-03):
   for wave ≥ 4, each spawn rolls an elite chance (0.22); elite = scale ×1.35, emissive
   retint `0xffa02f`, HP ×3, speed ×1.15, score ×2. The CHANCE is derived from the wave
   number — no hand-written elite lists (acceptance #18 holds for elites). **GDD resolution
   (§3.4, §9 Decision 2): raiders only — gunner + rammer; orbs excluded (their cyan
   identity + onboarding waves stay clean); the roll lives in `spawnRaider`
   (`src/enemies.js` L89-91) with an unconditional reset of tint/scale/HP-mult on every
   spawn (a former elite must never respawn elite); counts are PRE-elite (a table row is
   the spawn plan, the elite roll is a per-spawn modifier after it); an elite ram that
   lands still denies score (the ram is the failure state).**
3. **Per-wave composition tables** (deferred to this story by story-012 L35: "the pure
   formula in enemies.js is untouched — per-wave tables are story-019"): **GDD resolution
   (§3.5, §9 Decision 3): waves 1–5 are table-driven — an authored deterministic
   `{gunner, rammer}` split whose TOTALS equal the derived `waveCount` exactly (the shipped
   difficulty curve is unchanged; the table's job is the deterministic kind split), orbs
   stay the pure `droneCountFor` rule, wave 6 is the boss gate (`BOSS_WAVE = 5` in
   boss.js's own numbering; `spawnBoss` instead of wave 6), and the derived formulas
   (stochastic `rammerShare` split included) remain the fallback beyond.** Boundary =
   after wave 5, stated in the `src/enemies.js` header and asserted BOTH ways (wave 5
   reads the table, wave 6+ reads the formulas). A table-bypass mutation is caught by the
   deterministic-split assert (the old `rammerShare` roll changes wave 1's authored
   1-gunner/3-rammer).
4. **Balance telemetry** (the stage's namesake): **GDD resolution (§3.7, §9 Decision 4):
   the 12-group event-driven accumulator** — kills by kind (+ elite/charged splits), shots
   /hits by stream vs charged (accuracy is DERIVED by the reader, never stored as a
   division), damage taken by the four honest sources (`bolt` honestly merges gunner fire
   and the boss volley — they ride the same pool; `ram`/`dive`/`bossDash` tagged
   separately), `deathBy`, score by source, `waveReached` + `waveTimes[]` (the pacing
   curve, free at wave-increment events), pickup counters (dropped/picked/expired/byKind).
   Lives as `C.telemetry` in combat.js; zeroed in `enterCombat` beside score/kills;
   `damagePlayer` gains an optional source tag (exactly four call sites). Exposed via
   `combatState().telemetry`. Player-facing UI unchanged — telemetry is a tuning surface,
   not a feature.

## Scope

- `src/combat.js` — `SCORE_BOSS` const + the award in the `bossApi.report` wrapper
  (`bossDefeated` branch, L130-141, with the `C.bossAwarded` latch); telemetry accumulator
  zeroed in `enterCombat` beside score/kills (`src/combat.js` L453 pattern); `damagePlayer`
  source tag (4 call sites).
- `src/enemies.js` — elite roll + unconditional per-spawn reset in `spawnRaider` (L89-91),
  the waves 1–5 composition table + the header boundary note, per-entity elite speed
  multiplier.
- `src/probes.js` — telemetry + elite/table probe reporting for the harness.
- `tools/flow-check.mjs` — new asserts (red-first, below).
- **`src/boss.js` — ZERO-DIFF** (TD-corrected: the award lives in combat.js's wrapper;
  boss.js never sees score).

## Non-goals

- No wave-count/speed formula retune beyond the composition tables — evidence-driven
  retunes are a follow-up that READS this story's telemetry.
- No new enemy kinds — elite is a variant of **raiders only** (gunner + rammer; orbs are
  excluded by the GDD resolution).
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
- [ ] Elites: probe forces wave ≥ 4 (spawn injection) → the elite rate lands in the
      binomial 95% band for p = 0.22 over N = 50 real rolls; each elite stat (HP ×3 /
      speed ×1.15 / score ×2 / tint 0xffa02f / scale ×1.35) asserted via probe fields;
      wave < 4 produces zero elites; a former elite's respawn reads normal (the
      unconditional per-spawn reset).
- [ ] Tables: the authored waves 1–5 split matches the GDD table exactly (deterministic —
      wave 1 = 1 gunner / 3 rammers, etc.); totals equal the derived `waveCount` per wave;
      wave 5 reads the table AND wave 6+ reads the derived fallback (asserted BOTH ways at
      the boundary); `src/enemies.js` header states the boundary.
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
- **Elites**: determinism by spawn injection (no seeded RNG exists in the tree — TD
  finding, 2026-11-05); rate asserts run binomial 95% bands over real rolls; mutations
  (chance → 0 → RED; tint removed → RED; reset removed → RED via the respawn assert)
  recorded with dates + adjacent keep-passing cases.
- **Telemetry**: one scripted kill → kills-by-kind +1 and the accuracy arithmetic checks;
  mutation "forget to zero on enterCombat" → RED via the restartProbe parity assert.

## Files touched

- `src/combat.js`, `src/enemies.js`, `src/probes.js`, `tools/flow-check.mjs`.
- `production/qa/evidence/story-019-elites-waves-telemetry/` — report + red/mutation
  outputs.
- **NOT touched**: `src/launch.js`, `src/main.js` (zero-diff), `src/audio.js`,
  `src/phases.js` (the card already reads `cs.score`), **`src/boss.js` (zero-diff — the
  award lives in combat.js's report wrapper; the TD-corrected site)**.

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
