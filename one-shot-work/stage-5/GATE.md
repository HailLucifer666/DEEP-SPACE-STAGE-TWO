# GATE — Stage 5 (ship prep)

Run 2026-11-07 on the stage-5 close commit (tagged `good-2026-11-07-d`), whose tree
carries: master `df31d29` (== good-2026-11-07-c) + README + smoke record + CHANGELOG
Stage 5 + the corrected ledger/register. Machine gates: PASS. Ship checkpoint: pending
(deploy go, TD-007, TD-08, the owed verdicts — below).

- [x] Every acceptance criterion in the story files met or honestly dispositioned —
      PASS: story-020's ACs machine-verified (17 asserts + the page-boundary console
      assert; persistence both directions, corrupt-reads-unmuted incl. the numeric-'2'
      discriminator, restore-never-rewrites, laziness via the placement pin + the
      boot-marks timing witness; the storage-blocked path recorded as inherited
      coverage, not re-driven — stated in the story and the report). The rider ACs
      verified per rider (bands with exact-coverage arithmetic; lastRoll gate
      red-first with flag-ON byte-identity; §8.5 doc-only with hud.js byte-identical;
      M-key label red-first). The experiential items remain OWED at the ship
      checkpoint (revocable at any tag; rollback = git checkout good-2026-11-07-c).
- [x] Regression: all earlier tests still pass — PASS: flow-check 170 → 188 (story-020)
      → 190 (riders), 0 failed on merged master; the pre-existing assert set is
      byte-intact except the sanctioned band/label changes, each carrying the
      2026-11-07 policy provenance + exact-coverage arithmetic; both recorded
      statistical mutations re-run RED under the new bounds (186/2, 184/4).
- [x] The documented run path executed — PASS: the smoke battery ran the merged master
      build end-to-end (build 4.41 MB → dep-check acyclic 263/500 → flow-check 190/0
      CONSOLE [] → boot-marks 1155 ms in the documented envelope) —
      production/qa/smoke-2026-11-07-stage5.md; `npm run build` regenerates index.html
      (never hand-edited; the independent reviewer byte-verified a fresh rebuild
      against the committed bundle).
- [x] Performance basics — PASS: main.js 263/500 (dep-check enforces); no src file
      ≥ 800; boot-to-title 279–1824 ms across this stage's runs, inside the
      documented ≈0.3–2.5 s variance envelope (the tail is GLB parse variance under
      load); the E.lastRoll diagnostic no longer allocates in production (rider B).
- [x] Known limitations listed honestly — PASS (the carry-forward list):
      * Harness Edge-binary pin (EDGE override documented in the README; TD-016 for
        dynamic resolution).
      * Environment finding OPEN: headless-Edge Math.random run-level batching (root
        cause not established; the mechanism gates + 99%+ exact bands are the shipped
        answer, joint false-red ≈3%).
      * OVERDRIVE residual stall class co-red (TD-017; rerun policy stands).
      * Storage-blocked path inherited-by-construction, not driven with a real
        blocked-storage browser.
      * S3X + stage-3/4 look/feel verdicts OWED at the ship checkpoint.
      * TD-018 pre-publication content pass (internal notes ship with one-shot-work/
        and production/) — rides the ship checkpoint with TD-007.
      * TD-008 litter MEASURED 2026-11-07: ~1.0 GB / 40 dirs (the ~400 MB and ~8 GB
        figures both corrected).
- [x] No false greens — PASS: every red in the stage is recorded with its mechanism
      (story-020's 181/7 + mutations A–D; riders' 188/1, 189/1 reds + four mutations
      + the two re-run statistical mutations); the harness was altered only by the
      player-approved band policy (provenance + arithmetic recorded) and one
      honest assert-label rename; no other semantic change.

## Independent whole-stage review (2026-11-07)

Verdict: **GATE-READY: NO** on first pass — 3 blocking + 5 non-blocking findings, all
commit/text hygiene (the close records existed only in the working tree; a stale
"latest tag" line and a boot-gate claim the harness never enforced in the README; the
CHANGELOG citing this GATE before it existed; register rows TD-016/017/018 missing;
the 200k-simulation claim without an artifact → reworded to the evidenced derivation;
the ledger baseline nit). The engineering chain verified clean end-to-end (every
statistic recomputed from scratch; every transcript re-read; the merged code checked
directly). Every finding was fixed in the close commit; nothing was argued away.

RESULT: **PASS (machine gates)** — ship checkpoint pending: (1) the deploy go
(GitHub Pages is the chosen host; deploy needs its own explicit go; TD-007 identity
rewrite + TD-018 content pass BEFORE the repo goes public), (2) TD-007 git-identity
rewrite go, (3) TD-08 litter deletion go (~1.0 GB measured), (4) the owed S3X +
stage-3/4 look/feel verdicts. The gate reduces risk; it does not prove the absence of
bugs.

CHECKPOINT RECORD (2026-11-07): the ship-checkpoint dialog was presented with all
three go/no-go items (TD-007 with backup-first / TD-08 ~1.0 GB / repo publication
sequencing) — UNANSWERED, same as the stage-3 and stage-4 close attempts. Working
defaults adopted, each reversible and none executed beyond this recording: TD-007 =
HOLD (nothing rewrites history without the explicit go), TD-08 = HOLD (the ~1.0 GB
litter harms nothing where it sits), repo publication = HOLD until the playtest
sign-off (the repo-LAST ruling stands; the submission-link track — itch/Netlify for
the recruiter — is the parallel session's thread and was not touched). The owed
S3X + stage-3/4 look/feel verdicts remain OWED, revocable at any tag (rollback =
git checkout good-2026-11-07-d). Stage 5 is CLOSED on machine gates; every remaining
item opens on the player's word, exactly as Stage 4 handed it over.
