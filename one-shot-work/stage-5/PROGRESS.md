# STAGE 5 — ship prep (stories 020, README, riders)

Skill: one-shot | Rigor: LEAN | Output type: game | Gate: not run
Opened: 2026-11-07 — gate-first: story-020 scope + this ledger written into the repo
BEFORE any Stage 5 code (the conversation-only gate; stage-4 precedent). The stage-4
checkpoint went UNANSWERED (recorded in stage-4/GATE.md); the player opened Stage 5 with
a full brief on 2026-11-07 — this ledger is the reply to that brief.

Plan: story-020 (settings persistence, mute-only pending the open-checkpoint confirm) →
the stage-4 riders IF the player approves them at the open checkpoint (flake bands →
99%+, E.lastRoll probe-gating, GDD §8.5 wording) → README.md (interview-reviewer
framing) → stage close (independent review, smoke record, changelog, GATE.md) → the
ship checkpoint (hosting decision, TD-007, TD-08, the owed look/feel verdicts).

Per-story cycle (same as stages 1–4): implement → spec review → quality review →
gates (build + dep-check + flow-check + boot-marks) → merge --no-ff → tag
(good-2026-11-07-b chain, next letters after -b).

Known-good baseline: master 55aff08 == good-2026-11-07. flow-check 170 asserts.
Disk anomalies found at open: index.html flagged M by git but content-identical
(CRLF/LF eol state only — zero `git diff`); build/ carries the stage-4 working litter
(edge-profile dirs = TD-08's subject, probe scripts, diag shots) — all untracked, none
of it ships.

| Item | Status | Evidence |
| --- | --- | --- |
| Gate: write-down committed | done | story-020 + EPIC row + this ledger, 2026-11-07 (pre-code commit) |
| Open checkpoint (riders / 020 scope / hosting) | pending | AskUserQuestion 2026-11-07 — riders execute ONLY on approval; 020 mute-only reading presented; hosting presented with recommendation |
| story-020 settings persistence | pending | story-020-settings-persistence.md |
| Rider A: flake policy Option A | pending player OK | stage-4 GATE.md DECISION 1 — drop-rate + kind-split + OVERDRIVE bands to 99%+ coverage, joint false-red ≈14% → ≈4%; every recorded mutation must still red under the new bands |
| Rider B: E.lastRoll probe-gating | pending player OK | stage-4 GATE.md DECISION 3 — the per-spawn diagnostic capture in src/enemies.js L182/196 runs only under ?balanceProbe=1; lastRollProbe() reads null when off; balance drive unaffected (it runs with the flag on) |
| Rider C: hint-bar/GDD §8.5 wording | pending player OK | stage-4 GATE.md DECISION 2 working default — KEEP the hint bar's charge-shot line; re-word GDD §8.5 to measure suppression-readability + chip legibility (doc-only) |
| README.md | pending | beside index.html; run instructions (double-click, file://), controls, architecture map, harness explainer, design decisions + known limitations, portfolio framing; 5-minute interview read |
| Hosting | pending player decision | options + labeled recommendation presented at the open checkpoint; NOTHING deploys without the explicit go-ahead |
| TD-007 git identity rewrite | pending player go | owner chore — rewrite the provisional identity on all commits BEFORE the repo goes public; destructive history rewrite, needs the explicit go |
| TD-08 build-litter deletion | pending player go | owner chore — the ~8 GB Edge-profile litter in build/; destructive delete, needs the explicit go |

Owed from stage 4 (GATE.md, revocable at any tag): S3X + stage-3/4 look/feel verdicts —
one playtest covers them; collected at THIS stage's ship checkpoint.
