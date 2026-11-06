LEDGER — STAGE TWO
CURRENT: BOOTSTRAP — reconciled 2026-11-06; STOP: unrestored mutation in working tree (see below)
PLAN: B-full (5+ days, flexible) — decided 2026-11-06
SEED: C:\Users\acarg\.opencode\plan\STAGE-TWO-LAUNCH-10-10.md → one-shot-work/LAUNCH-10-10.md

| ID | Title | Branch | Status | Tag / Evidence |
|---|---|---|---|---|
| W1 | R-c: main.js refactor | r-c-mainjs-refactor (merged) | done-verified | merge 1cb07a3, tag good-2026-11-06 |
| W2 | Story-018 charged shot + pickups | story-018-charged-shot-pickups | doing — BLOCKED | commits 7127443 + 5ae021e on branch; NOT merged to master (master = 27e4a61); report.md still IN PROGRESS; **unrestored mutation in tree — STOP** |
| W3 | Story-019 elites/waves/telemetry/boss-reward | — (none) | todo | spec exists; no branch, no code |
| W4 | Story-020 settings persistence + accessibility | — | blocked on W2/W3 | no story file yet |
| W5 | Stage 4 close | — | todo | GATE pending |
| W6 | Stage 5 ship prep | — | todo | README absent |
| W7 | Release gate | — | todo | release-1.0 absent |

## STOP — unrestored mutation (2026-11-06, bootstrap reconciliation)

- `src/powerups.js:80` currently reads `if (true) return false; // MUTATION 2026-11-06: drop roll removed (verified-applied run; restored after)` — the comment claims a restore that did not happen.
- `index.html` (generated) is dirty vs HEAD `5ae021e` (+5/−5) — consistent with a rebuild from the mutated source.
- `production/qa/evidence/story-018…/flow-mutation-droproll.txt` (1,769 B) exists, so the mutation WAS run; the tree was left mutated after the run.
- Rules: do NOT build, do NOT run flow-check, do NOT merge W2 until this is resolved.
- Resolution (owner's call, one session): `git diff -- src/powerups.js index.html` review → restore the line → `npm run build` → battery → confirm green → amend or follow-up commit → proceed with T-018-D/E (spec review → quality review → merge --no-ff → tag).

## Owner report vs disk (2026-11-06)

- Owner: 3/7 complete (W1, W2, W3 done; W4 waiting).
- Disk: only W1 is merged/tagged. W2 is committed on its branch but unmerged. W3 has not started.
- Resolution: treat W2 as doing-blocked and W3 as todo. W4 does not start yet.
