# Story 013: boss fight — multi-phase, HP bar, weak point, slow-mo death

> **Epic**: combat-feel-fix (Stage 2 — boss + victory)
> **Status**: Pending
> **Layer**: Logic/Feel
> **Type**: Logic
> **Estimate**: L
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-04

## Context

The take-home P0's centerpiece. The boss arrives after wave N (start **N = 5**, a tuning
knob): when wave 5 is cleared, the boss spawns instead of wave 6. Multi-phase state machine,
HUD presence, a weak point worth aiming at, and a slow-mo death reusing the existing
effects pools. Player-feel pass gates the merge (collected at stage close per the full-auto
grant — screenshots retained).

**Rides three accepted Stage-1-review TDs** (each a named fix, each with a probe or pinned
reason in the report):
- **TD-013** — wrap the composer render call in src/loop.js's render branch (post story-011:
  `composer ? composer.render() : renderer.render(...)`): first render-time throw → log once,
  degrade to direct render permanently. Never-crash contract for the render path.
- **TD-014** — stale `#tele` SPD line rides the pad ~2.6 s after REPLAY: clearCombat()
  resets the combat-owned `#tele` write (same place it clears `#hud-bars`), probe asserts
  the pad's `#tele` is empty.
- **TD-015** — `musicTo` runs un-guarded inside phase-enter hooks: try/catch inside
  musicTo (src/audio.js) with a one-line warn + `'none'` state. A WebAudio exception can
  never abort a phase transition.

## Design (the state machine + knobs)

- Phases by HP fraction: **orbit+volley** (>66%: holds ring range 25–35 u, fires aimed
  3-round volleys with spread) → **charge** (66–33%: periodic dash at the ship's CURRENT
  position with a 0.8 s telegraph — full stops are ram-bait, so the charge overshoots
  past the ship and re-orbits) → **rage** (<33%: faster volley cadence + tighter orbit,
  visual: glow intensity up).
- **Weak point**: a glowing core node on the hull (the drone silhouette language, story-012).
  Bolts hitting it do **3× damage**; the node reads as a bright emissive sphere — aim skill
  matters. Boss HP 60 (≈ 20 body hits / 7 weak-point hits at 1 dmg bolts).
- **Slow-mo death**: on HP 0 — `setTimeScale(0.3)` for ~1.2 s, chained explosions from the
  existing EFFECTS pools, then the phase reports `bossDefeated` (story-014 wires the victory
  card to this signal; until then the fight loops to the next wave).
- **HUD HP bar**: rides the existing change-gated `#hud-bars` wholesale write (combat.js) —
  a `BOSS ▍▍▍ 62%` line while the boss lives, gone when it dies. Same language as
  story-010: presentation-only, change-gated, no per-frame churn.
- Balance knobs (all named constants in src/boss.js): `BOSS_HP`, `VOLLEY_INTERVAL`,
  `CHARGE_SPEED`, `RAGE_MULT`, `WEAK_MULT`, `BOSS_WAVE` (=5). Review r2's combat knobs
  (TURN_RATE first, tightest circle 7.7 u) stay untouched in this story.

## Acceptance Criteria

- [ ] `src/boss.js` (new): single-entity state machine (no pool), procedural body matching
      the neon look, weak-point node as a separately-hittable child mesh, `clear()` drain
      wired into combat clear (restart baseline holds — restartProbe stays clean).
- [ ] Wave gate in the wave logic: after wave `BOSS_WAVE` clears, the boss spawns once;
      `combatState()` gains `boss: { hp, maxHp, phase } | null`.
- [ ] Probe `?bossProbe=1`: forces the boss immediately (skips the wave wait), then walks
      the state machine deterministically — reports `bossProbe: { phases, weakHits,
      bodyHits, deathSlowmo }`. Phase transitions assertable: each phase entered in order
      under scripted damage.
- [ ] Weak point proven: probe applies equal bolt streams to node vs hull, asserts the 3×
      damage ratio (red-before-green: the assert fails on master, mutation recorded in the
      test file — e.g. WEAK_MULT→1 flips it red).
- [ ] HUD bar proven: probe asserts the `BOSS` line appears in `#hud-bars` when the boss
      lives and is gone after death; TD-014 probe asserts pad `#tele` is empty after REPLAY.
- [ ] TD-013 probe: a forced composer render throw flips the render path to direct and the
      game keeps running (CONSOLE shows the one-line degrade, not a crash).
- [ ] TD-015: a forced musicTo throw inside a phase transition logs the warn, the phase
      still lands (phase: combat probe passes with audio degraded).
- [ ] flow-check 28/28 + story-012's drone asserts + boss asserts green; full probe set
      green; restartProbe clean.
- [ ] Retained screenshots `production/qa/evidence/story-013-boss/s13-boss-{orbit,charge,rage}.png`
      + programmer report at `production/qa/evidence/story-013-boss/programmer-report.md`
      (include the TD-013/014/015 evidence inline).

## Out of Scope

- Victory card (story-014 — this story loops waves after boss death).
- Drone behavior changes (story-012 owns it; the boss may REUSE its steering helpers but
  does not modify them).
- Difficulty re-tuning of raiders/waves (boss balance only).

---

## Files (pre-authorized)

- `src/boss.js` (new), `src/combat.js`, `src/enemies.js` (wave-gate hook only)
- `src/audio.js` (TD-015 only), `src/loop.js` (TD-013 only), `src/main.js` (TD-014 only —
  the #tele clear rides clearCombat in combat.js if that is where it lands; main.js only if
  the probe surface needs the field)
- `tools/flow-check.mjs` (boss + TD asserts)
- `production/qa/evidence/story-013-boss/` (report + screenshots + stamp)

---

## Test Evidence

**Status**: [x] Created — probe outputs, red-before-green + mutation records, screenshots.
> Branch `story-013-boss-fight`, 2026-11-04. RED on master (b0eff8d): flow-check **43/13**
> (`flow-red-master.txt` — TD-014's stale `SPD 17 u/s` reproduced + 8 null-probe boss reds +
> TD-013/015 surface reds; 3 keep-passing green by design). GREEN: **56/56, CONSOLE []**
> (`flow-green-branch.txt` + final re-run `flow-green-final.txt`). 4 mutations recorded
> (WEAK_MULT→1 r=1; CHARGE_AT→0 phaseLog ["orbit","rage"]; tele-clear removal;
> post-flip removal) — full outputs + inline TD evidence in
> `production/qa/evidence/story-013-boss/programmer-report.md`. Screenshots
> `s13-boss-{orbit,charge,rage}.png` retained; restartProbe=3 `clean:true` (entities 31,
> boss meshes in the baseline).

---

## Dependencies

- Depends on: story-011 (modules), story-012 (drone steering helpers + `boss` field shape).
- Unlocks: story-014 (boss death → victory).
