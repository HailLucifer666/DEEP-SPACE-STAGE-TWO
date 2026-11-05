# Story 018: charged shot + pickups

> **Epic**: combat-feel-fix (Stage 4 — balance + telemetry)
> **Status**: Pending — scope LOCKED and recorded 2026-11-05 before any Stage 4 code (the conversation-only gate)
> **Layer**: Logic/Feel + UI
> **Type**: Logic + UI
> **Estimate**: L
> **Last Updated**: 2026-11-05

## Provenance — why this file exists (the Stage 4 gate)

The Stage 3 close (`one-shot-work/stage-3/GATE.md`, `stage-3/PROGRESS.md` L151-163) recorded
that story-018's scope existed ONLY in the 2026-11-04/05 conversations. Per the stage-3 close
decision, the scope is written down here BEFORE any Stage 4 code, or it is lost. This file is
that record, written 2026-11-05.

**Locked in conversation (2026-11-04/05):**

1. Story-018 = **charged shot + pickups** (this file).
2. Story-019 = elite enemies + per-wave composition tables + balance telemetry + the boss
   reward — value **1000 flat** (see story-019).
3. The mandatory main.js refactor (R-c / TD-003) lands FIRST in Stage 4, before any story
   adds a line to main.js (500/500 at the stage-3 close, zero headroom — dep-check enforces).

**NOT recovered (stated honestly) — RESOLVED 2026-11-05 by the Stage 4 GDD pass:** the charged
shot's parameters were never written down on disk (searched across `one-shot-work/`,
`design/`, `production/`, `docs/` — zero hits). The Stage 4 GDD
(`design/gdd/stage-4-balance.md`, written 2026-11-05) now fixes them: **threshold
spray-then-charge** — the LMB-only stream fires exactly as shipped below `T_CHARGE = 0.6 s`
of continuous hold; at the threshold the stream suppresses and the charge fills (whine starts);
release fires exactly one charged bolt, `CHARGE_DAMAGE = 6` vs the regular bolt's literal-1
damage. DPS parity anchor ±15%. Full options analysis + the three alternatives in GDD §9
Decision 1 — the player can re-pick at the stage checkpoint (rollback = tag).

## Goal

Two player-facing additions, both combat-only:

1. **Charged shot** — the fire control gains a charged variant that rewards holding before
   release: one bigger/better bolt instead of the continuous stream, with a readable charge
   state (HUD + audio) and its own kill path. Parameters: GDD §charged-shot (pending — see
   Provenance).
2. **Pickups** — enemies drop powerups on death; flying through one grants a timed effect.
   Spec inherited verbatim from the pre-roadmap S5 plan (`one-shot-work/HANDOFF.md` L227,
   written 2026-11-03):
   - on kill, `Math.random() < 0.18` → drop one of **SPREAD / OVERDRIVE / SHIELD**;
   - rotating pickup sprite, 8 s ground life, blink during the last 2 s, pickup radius 1.4;
   - effects last 8 s: **SPREAD** = 3-bolt fan (±6°), **OVERDRIVE** = fire interval ÷ 2.2,
     **SHIELD** = +full shield + zero regen delay for the window;
   - HUD chips show active effect + seconds left;
   - timer state lives in the combat.js player object; `clearCombat()` wipes it.

## Scope

- `src/powerups.js` (NEW) — drop roll, pickup entity (reuse-first pool pattern), effect
  timers, pickup reporting; dep-check must stay acyclic (nothing imports main.js).
- `src/combat.js` — charged shot in the fire path (fire interval / bolt spawn), kill→drop
  hook, effect application, `combatState()` gains charge + active-effect fields for the
  harness.
- `src/input.js` — **zero change** (GDD resolution: the threshold model reads the existing
  LMB hold state; the pause cancel reads the keys the fire path already sees).
- HUD (charge meter + effect chips): `src/main.js` (PANEL_HTML/panels) and/or
  `tools/index.template.html` — **only after R-c has merged** (main.js is 500/500 until then).
- `src/audio.js` — charge whine + pickup/expire blips (synth recipes, audio-bag pattern).
- `tools/flow-check.mjs` — `?chargeProbe=1` / `?powerupProbe=1` probe pages + asserts.

## Non-goals

- No new enemy kinds and no wave-table changes (story-019). No boss behavior changes.
- No score/combo rework — score constants untouched (the boss award is story-019).
- No drop-rate tuning — 18% ships as inherited; retuning happens WITH story-019's telemetry.
- Launch phases untouched (`src/launch.js` zero-diff; the diff review verifies it).
- `index.html` never hand-edited (build output only).

## Acceptance criteria (structure now; numbers filled from the GDD when it lands)

- [ ] Charged shot (GDD §3.1-3.2 numbers): the LMB-only stream fires exactly as shipped
      below `T_CHARGE = 0.6 s` of continuous hold (a 0.2 s tap → ≥ 1 stream bolt, 0
      charged); at the threshold the stream suppresses, the charge fills (whine starts), and
      release fires exactly ONE charged bolt (`CHARGE_DAMAGE = 6` — one-shots a seeded
      gunner AND a seeded elite gunner; weak-point hit does 18 via the existing dmg param —
      `src/boss.js` untouched); release before the threshold fires nothing extra; charge
      state visible (`combatState().charge/charging`; HUD meter post-R-c) and audible;
      charging cancels on death, pause, and combat exit (accumulator wiped, release fires
      nothing); `combatState()` exposes the charge state.
- [ ] Pickups: a kill drops at most one pickup at the 18% rate (forced-kill probe over
      N = 100 real rolls, binomial 95% band for p = 0.18 — **no seeded RNG exists in the
      tree**; determinism comes from probe-forced kills/spawns, GDD §8.3); despawn at 8 s
      with a 2 s blink (visibility probe); each effect verified per-kind (SPREAD 3-bolt fan
      ±6° stream-only, OVERDRIVE interval ≈ 0.0568 s, SHIELD refill 50 + regen delay zeroed
      in-window and restored 3 s after expiry); same-kind re-pickup refreshes to 8 s (never
      stacks); different kinds run concurrently; effect expires at 8 s; HUD chip shows name
      + seconds (post-R-c); `clearCombat()` wipes timers and entities — `restartProbe` stays
      `clean:true` (pickups join the baseline, ~6 entities, recorded growth).
- [ ] All existing flow-check asserts stay green (114 + new); every new harness page asserts
      its own `CONSOLE []`; boot-marks MODULE→TITLE inside the documented band; dep-check
      acyclic with main.js ≤ 500.
- [ ] Controls text updated in both homes (CONTROLS panel, hint bar) — the "obvious
      controls" pillar.
- [ ] Experiential (playtest, stage close): charged shot discoverable without instructions;
      a pickup is legible (what it does, how long is left).

## Test plan (red-first)

Harness: `tools/flow-check.mjs` — new probe pages report on `window.__stage2`
(`lastReport` parity, per-page `CONSOLE []`). Every new assert is seen RED on the prior
build before the change lands; mutation + date recorded IN the test file; the mutation is
verified applied (read its red output); adjacent keep-passing cases ship with every
mutation.

- **Determinism without a seeded RNG** (TD finding, 2026-11-05: no seedable RNG exists in
  the tree): probes force kills/spawns directly (the spawnForProbe precedent) and rate
  asserts run binomial 95% bands over N real rolls; if an assert proves flaky, widen the
  trial count, never the bounds. The GDD's "seeded" wording is implemented as
  forced/injected for this reason.
- **Ordering probes**: charge release during death slow-mo; a pickup taken during the boss
  fight (boss exempt from DROPS, but effects must still apply — OVERDRIVE matters most
  there).

## Files touched (pre-authorized; refined when the GDD lands)

- `src/powerups.js` (new), `src/combat.js`, `src/probes.js`, `src/audio.js`,
  `tools/flow-check.mjs`.
- HUD (only post-R-c): `src/main.js` and/or `tools/index.template.html`.
- `production/qa/evidence/story-018-charged-shot-pickups/` — programmer report + red/
  mutation outputs + screenshots.
- **NOT touched**: `src/launch.js`, `src/boss.js` (unless the GDD's charged shot interacts
  with the boss weak point — then only with an explicit GDD § and a bossProbe assert).

## Risks

- **The fire-button conflict is the load-bearing design risk**: if charge-on-hold replaces
  hold-fire, every existing fire assert (holdfire verdicts, scriptedKill, bolt pools)
  re-derives. The GDD states the choice and its probe consequences BEFORE implementation.
- **main.js ceiling**: HUD work is gated on R-c; a slipping R-c slips the HUD with it.
- **restartProbe baseline growth**: pickups join the pool baseline; entities rises —
  expected, recorded (same-build comparison, story-017 precedent).
- **RNG flake**: seeded; widen trials, not bounds.

## Unlocks

- Story-019 reads the drop/effect surfaces for its telemetry fields (powerups picked).
- Stage-4 close: the charged-shot feel verdict joins the owed look/feel list at the
  checkpoint.
