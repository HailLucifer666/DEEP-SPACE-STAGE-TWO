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
| Open checkpoint (riders / 020 scope / hosting) | ANSWERED 2026-11-07 | Player approved: riders A+B+C execute; story-020 scoped mute-only (the Provenance confirmation the story file anticipated); hosting = GitHub Pages (README names it; deploy still needs the explicit go) |
| story-020 settings persistence | DONE 2026-11-07 | merged 93062ed (--no-ff), tag good-2026-11-07-b. Cycle: red-first commit fb4fe70 (181/7 on the unmodified build) → implementation abd8fa7 → evidence 6ce392a → quality-fix round 1e65ee5 (comment-truth: the gesture-beat-warm-block race named as load-bearing). Spec review COMPLIANT (4 deviations adjudicated legitimate); quality review CONCERNS→APPROVE after the comment-fix round. Orchestrator battery on merged master: build 4.41 MB, dep-check PASS 261/500, flow-check 188/0, boot-marks 1824 ms in band, CONSOLE []. flow-check 170→188. |
| Rider A: flake policy Option A | in progress (dispatched) | stage-4 GATE.md DECISION 1 — drop-rate band [11,25]→[9,28] (exact coverage 95.05%→99.14%, computed offline), kind-split χ²(2) 5.991→9.210, OVERDRIVE bands re-derived or proven ≥99% by deterministic-bounds arithmetic; every recorded mutation still red; elite sanity [3,21] untouched |
| Rider B: E.lastRoll probe-gating | in progress (dispatched) | stage-4 GATE.md DECISION 3 — capture in src/enemies.js L196-200 gated behind ?balanceProbe=1 (self-read: probes-balance imports enemies, so the reverse import is a cycle); off → lastRoll stays null; balance drive asserts stay green; red-first "flag-off N spawns → null" assert |
| Rider C: hint-bar/GDD §8.5 wording | in progress (dispatched) | stage-4 GATE.md DECISION 2 working default — KEEP the hint bar's charge-shot line; §8.5 discoverability item re-worded to hint-comprehension + suppression-readability + chip legibility, provenance note dated 2026-11-07 (doc-only) |
| Rider D: M-key label refresh (NEW, reviewer-ruled) | in progress (dispatched) | spec-review ruling: pre-existing (input.js:46 never refreshed; witnessed red in story-020 transcripts), out of 020's locked scope, rider-sized. input.js KeyM gains refreshSoundButton() (import input→hud, acyclic); red-first assert "M press flips the label in-session"; mutation recorded |
| README.md | pending | beside index.html; run instructions (double-click, file://), controls, architecture map, harness explainer, design decisions + known limitations, portfolio framing + GitHub Pages as the named host; 5-minute interview read |
| Hosting | DECIDED: GitHub Pages | player decision 2026-11-07; deploy execution deferred to the ship checkpoint with the explicit go (gh account note: active account reverts to HailLucifer666 — switch to Arghyafsztpartners first) |
| TD-007 git identity rewrite | pending player go | owner chore — rewrite the provisional identity on all commits BEFORE the repo goes public; destructive history rewrite, needs the explicit go |
| TD-08 build-litter deletion | pending player go | owner chore — the ~8 GB Edge-profile litter in build/; destructive delete, needs the explicit go |

Owed from stage 4 (GATE.md, revocable at any tag): S3X + stage-3/4 look/feel verdicts —
one playtest covers them; collected at THIS stage's ship checkpoint.
