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

Known-good baseline: master 55aff08 (one docs commit above good-2026-11-07). flow-check 170 asserts.
Disk anomalies found at open: index.html flagged M by git but content-identical
(CRLF/LF eol state only — zero `git diff`); build/ carries the stage-4 working litter
(edge-profile dirs = TD-08's subject, probe scripts, diag shots) — all untracked, none
of it ships.

| Item | Status | Evidence |
| --- | --- | --- |
| Gate: write-down committed | done | story-020 + EPIC row + this ledger, 2026-11-07 (pre-code commit) |
| Open checkpoint (riders / 020 scope / hosting) | ANSWERED 2026-11-07 | Player approved: riders A+B+C execute; story-020 scoped mute-only (the Provenance confirmation the story file anticipated); hosting = GitHub Pages (README names it; deploy still needs the explicit go) |
| story-020 settings persistence | DONE 2026-11-07 | merged 93062ed (--no-ff), tag good-2026-11-07-b. Cycle: red-first commit fb4fe70 (181/7 on the unmodified build) → implementation abd8fa7 → evidence 6ce392a → quality-fix round 1e65ee5 (comment-truth: the gesture-beat-warm-block race named as load-bearing). Spec review COMPLIANT (4 deviations adjudicated legitimate); quality review CONCERNS→APPROVE after the comment-fix round. Orchestrator battery on merged master: build 4.41 MB, dep-check PASS 261/500, flow-check 188/0, boot-marks 1824 ms in band, CONSOLE []. flow-check 170→188. |
| Rider A: flake policy Option A | DONE 2026-11-07 | commit 5425135. Drop-rate [11,25]→[9,28] (exact 95.05%→99.14%, reviewer-recomputed), χ²(2) 5.991→9.210, OVERDRIVE bands UNWIDENED with the deterministic-bounds derivation recorded beside the asserts (in-regime [8,11]/[7,9]; independently re-verified in review); both recorded mutations re-red (186/2, 184/4); elite sanity untouched. Joint flake ≈3%. |
| Rider B: E.lastRoll probe-gating | DONE 2026-11-07 | commit 302da5d. Record construction gated behind a self-read ?balanceProbe flag (cycle-forced: probes-balance imports enemies); flag-ON byte-identical, flag-OFF stays null (red-first 188/1 → 189/0, mutation red); balance drive mechanism gates green (mismatches:0 on all 50). |
| Rider C: hint-bar/GDD §8.5 wording | DONE 2026-11-07 | commit 3046252 (+7/−2, doc-only). §8.5 item 1 → hint-comprehension with the dated provenance note; items 2-5 untouched; hud.js byte-identical. |
| Rider D: M-key label refresh (NEW, reviewer-ruled) | DONE 2026-11-07 | commit be38213. input.js KeyM refreshes the label (import input→hud, acyclic, dep-check PASS); red-first 189/1 → 190/0, mutation red. |
| Riders review + merge | DONE 2026-11-07 | Two-stage review: SPEC COMPLIANT + APPROVE (independent recomputation of every band number; OVERDRIVE re-simulation; byte-identical rebuild closes the disclosed process incident). Merged df31d29 (--no-ff), tag good-2026-11-07-c. Orchestrator battery on merged master: build 4.41 MB, dep-check 263/500, flow-check 190/0, boot-marks 1155 ms, CONSOLE []. flow-check 188→190. |
| README.md | pending | beside index.html; run instructions (double-click, file://), controls, architecture map, harness explainer, design decisions + known limitations, portfolio framing + GitHub Pages as the named host; 5-minute interview read |
| Hosting | DECIDED: GitHub Pages | player decision 2026-11-07; deploy execution deferred to the ship checkpoint with the explicit go (gh account note: active account reverts to HailLucifer666 — switch to Arghyafsztpartners first) |
| TD-007 git identity rewrite | pending player go | owner chore — rewrite the provisional identity on all commits BEFORE the repo goes public; destructive history rewrite, needs the explicit go |
| TD-08 build-litter deletion | pending player go | owner chore — the Edge-profile litter in build/, MEASURED 2026-11-07 at ~1.0 GB across 40 dirs (the ~8 GB figure in the brief was wrong); destructive delete, needs the explicit go |
| Stage close (review, smoke, changelog, GATE, README) | DONE 2026-11-07 | Independent whole-stage review: GATE-READY NO on first pass — 3 blockers + 5 non-blocking, ALL commit/text hygiene (uncommitted close records; stale latest-tag line; a boot-gate claim the harness never enforced; CHANGELOG citing GATE.md pre-existence; TD-016/017/018 register rows; the 200k-sim claim reworded to the evidenced derivation; baseline nit) — the engineering chain verified clean end-to-end with every statistic recomputed from scratch. All findings fixed in the close commit (tag good-2026-11-07-d). GATE.md: PASS (machine gates) — ship checkpoint pending: deploy go, TD-007, TD-08, owed verdicts. |
| SHIP CHECKPOINT | UNANSWERED (stage-3/4 precedent) | Dialog presented 2026-11-07 with all three go/no-gos (TD-007 backup-first / TD-08 ~1.0 GB / repo publication) — no answers. Working defaults recorded in GATE.md: all three HOLD, nothing executed beyond the recording. Stage 5 CLOSED on machine gates; remaining items open on the player's word. |

Owed from stage 4 (GATE.md, revocable at any tag): S3X + stage-3/4 look/feel verdicts —
one playtest covers them; collected at THIS stage's ship checkpoint.
