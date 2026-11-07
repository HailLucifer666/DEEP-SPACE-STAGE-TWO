# GATE — Stage 4 (balance + telemetry)

Run 2026-11-07 on master bc3c472 (== good-2026-11-07). Machine gates: PASS. Player
checkpoint: pending (verdicts + decision items below) — same structure as stage 3's gate,
which recorded owed verdicts rather than blocking on them.

- [x] Every acceptance criterion in the story files met or honestly dispositioned — PASS:
      story-018 ACs machine-verified (chargeProbe/powerupProbe blocks, 30 asserts; the +6
      pre-warm pin red-first; the pause-ordering assert red-first) except the §8.5
      experiential items, recorded OWED (018 report §5). story-019 ACs machine-verified
      (23 asserts: boss reward +1000 exact/re-fire/high-score, elite stats + reset pin,
      wave tables + boundary both ways, telemetry sanity + zeroing) except §8.5, recorded
      OWED (019 report §8); the elite-rate AC amended to the shipped mechanism gate
      (orchestrator ruling, 2026-11-07).
- [x] Regression: all earlier tests still pass — PASS: flow-check 114 → 170 asserts, the
      pre-existing set byte-identical through every story (verified per-commit and by the
      independent stage review); restartProbe=3 clean:true on merged master (entities 39 =
      33 + 6 pre-warm, recorded same-build); boot-marks in band (439 ms this battery).
- [x] The documented run path executed — PASS: the smoke battery ran the merged master
      build end-to-end (build → dep-check → flow-check headless → boot-marks headed →
      restartProbe drive); `npm run build` regenerates index.html (never hand-edited).
- [x] Performance basics — PASS: main.js 255/500 (dep-check enforces); no src file ≥ 800
      (max probes.js 711); boot MODULE→TITLE 439 ms (< 1000 gate; GLB variance band held,
      one 3328 ms load-coincident sample explained by parse time); BOLT_POOL raise is a
      prepare-time allocation (restart-clean preserved).
- [x] Known limitations listed honestly — PASS (the carry-forward list):
      * S3X + stage-3 look/feel verdicts + stage-4 look/feel verdicts OWED at the
        checkpoint (revocable at any tag; rollback = git checkout good-2026-11-07).
      * DECISION: flake-budget policy — the remaining 95% statistical asserts carry a
        ~14% joint false-red per run (measured); Option A (tighten all to 99%+, ≈4%)
        recommended by story-019 §11.
      * DECISION: hint bar announces the charge shot while GDD §8.5 measures unprompted
        discovery — re-word the item or soften the hint bar before the playtest.
      * DECISION: E.lastRoll (the merge-halt diagnostic) ships unconditionally in
        production — gate behind the probe flag or keep until the Math.random batching
        finding closes.
      * Elite hitbox wiring DEFERRED (orchestrator ruling, story-019 report §10) to the
        evidence-driven balance pass; alt-tab hold-fire input-state finding (B-01) on the
        backlog; boss.js L35 stale comment deferred (boss.js zero-diff in 019).
      * Environment finding OPEN: headless-Edge Math.random shows run-level batch
        behavior (captured 3.4σ draw batch; root cause not established).
- [x] No false greens — PASS: every red in the stage is recorded with its mechanism
      (the merge-halt chain: 3 band reds → instrumentation → mechanism verdict → gate
      redesign → mutation re-verified); no harness change was made to pass a red without
      either a fix-and-red-first record or a documented ruling (the [8,12] widen and the
      mechanism-gate replacement both carry arithmetic + mutation proof).

RESULT: **PASS (machine gates)** — player checkpoint pending: the owed verdicts + the
three decision items above + Stage 5 go-ahead. The gate reduces risk; it does not prove
the absence of bugs.
