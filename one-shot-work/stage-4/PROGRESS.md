# STAGE 4 — balance + telemetry (stories 018, 019)

Skill: one-shot | Rigor: LEAN | Output type: game | Gate: not run
Opened: 2026-11-05 — gate-first: story-018/019 scope + the boss reward (1000 flat) written
into the repo story files BEFORE any Stage 4 code (the conversation-only decisions;
stage-3 GATE.md known-limitation closed).

Plan: R-c main.js refactor (mandatory, own merge — 500/500, zero headroom) → story-018
(charged shot + pickups) → story-019 (elites, wave tables, telemetry, boss reward) →
stage close (independent review, smoke record, changelog, GATE.md).

Per-story cycle (approved): implement → spec review → quality review → gates
(build + flow-check + dep-check + boot-marks) → merge --no-ff → tag
(good-2026-11-05-g/h/i chain, next letters after -f).

Owed from stage 3 (GATE.md): S3X experiential + look/feel verdicts (pitch feel, drift
weight, arena readability, first-climb moment) — collected at THIS stage's close
checkpoint per the approved plan (one playtest covers stage 3 + stage 4). Revocable at
any tag.

Decisions locked (story files are the record): 018 = charged shot + pickups; 019 =
elites + wave tables + telemetry + boss reward 1000-flat.
Open design items (GDD pass): charged-shot parameters + binding model (hold-fire
conflict), composition-table shape + derived boundary, elite×table interaction,
telemetry field list.

| Item | Status | Evidence |
| --- | --- | --- |
| Gate: write-down committed | done | story-018/019 + EPIC rows + this ledger, 2026-11-05 (commit ca9f0ec) |
| Chair passes: architecture + GDD | done | docs/architecture.md §6-8 (R-c plan + contracts); design/gdd/stage-4-balance.md (643 lines, 4 decisions resolved, options in §9) |
| Story files amended with GDD params | done | 2026-11-05: fire binding = threshold spray-then-charge (T_CHARGE 0.6 s, CHARGE_DAMAGE 6 vs regular 1, LMB-only — Space is boost); elites = raiders only, pre-elite counts; tables = waves 1-5 authored (totals = derived), boundary wave 5/6; telemetry = 12-group event-driven set; award site corrected to combat.js report wrapper (boss.js zero-diff); no seeded RNG exists — determinism by probe-forced kills/spawns + binomial bands |
| R-c main.js refactor | todo | |
| story-018 charged shot + pickups | todo | |
| story-019 elites/tables/telemetry/reward | todo | |
| Stage close (review, smoke, changelog, GATE) | todo | |

Riders flagged (player calls at the checkpoint, not silent):
- BOLT_POOL 24→36 (SPREAD+OVERDRIVE saturation headroom; GDD §3.8) — recommend ACCEPT.
- boss.js L35 stale comment (says 20-HP arithmetic, shipped BOSS_HP is 60) — comment-only; boss.js is zero-diff in 019, so defer unless the player says otherwise.
- Alt-tab hold-fire input-state finding (blur clears mouseActive, not fire) — future polish list, no Stage 4 fix.
- Charged-shot fire-binding model ships as GDD §9 Decision 1 RECOMMENDATION (threshold spray-then-charge); the player verdicts it at the stage checkpoint (options + rollback = tag).
