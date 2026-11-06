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
| R-c main.js refactor | done | merged 1cb07a3, tag good-2026-11-06 (2026-11-06). main.js 500→255; src/hud.js (95) + src/rocket.js (223) NEW, initHud/initRocket ctx wiring; boot() decomposed (3 helpers ≤ 50 lines). Spec review: compliant (byte-identity mechanically reproduced; tools/ untouched by refactor commits). Quality review: merge-ready; finding 1 (dead writeHighscore import) fixed c6cdd78, bundle byte-identical proof. Merge-candidate battery (orchestrator-run): build 4.38 MB, dep-check PASS acyclic 255/500, flow-check 115/0, boot-marks MODULE→TITLE 994 ms < 1000. BONUS FIX: latent master crash — N key on title threw TypeError (ctx.activeFix never wired); fixed + red-on-master-proven regression assert (commit 8c8e9f2, the ONLY harness change; 114→115 asserts). |
| story-018 charged shot + pickups | done | merged cfab68c, tag good-2026-11-06-b (2026-11-06). Charged shot (threshold spray-then-charge, T_CHARGE 0.6, dmg 6, LMB-only, suppression, 3 cancels) + pickups (18%, 3 kinds, full-3D, refresh-not-stack) + charge ring/chips + 4 audio recipes + controls text. flow-check 115→147 asserts (red-first + 2 mutations + the +6 baseline pin + the pause-ordering assert). Review chain: spec ×2 (found the release-during-pause bug — fixed; input.js +2 recorded deviation, import cycle forced the direction flip), quality ×2 (found pre-warm allocating 1 not 6 — fixed red-first; probes.js 1499 + combat.js 819 over budget — split to probes-charge/-powerup/-common + weapons.js, combat.js 640), targeted re-review (merge-ready; band [9,12]→[8,12] + 2 doc refs). Merge battery (orchestrator-run): build 4.40 MB, dep-check PASS 255, flow-check 147/0, boot 348 ms (one 2484 sample = documented GLB variance). Riders landed: BOLT_POOL 36. Deviations recorded in evidence report §3.5/§5/§7. |
| story-019 elites/tables/telemetry/reward | doing | dispatched 2026-11-06 |
| Stage close (review, smoke, changelog, GATE) | todo | |

Extra riders recorded at R-c close (2026-11-06):
- flow-check.mjs is 1147 lines vs the 800-line file budget — if the budget covers tooling, a flow-check decomposition is a future R-series target (quality-review open question 2; not this stage).
- Pre-existing stale comment (main.js rocketMetrics "expect [-0.8]" vs real [0,-0.8]) — reported by the implementer, untouched (out of blast radius).
- BOLT_POOL 24→36 rides story-018 (orchestrator-accepted per GDD §3.8 recommendation; player may veto at the checkpoint — rollback = tag).

Riders flagged (player calls at the checkpoint, not silent):
- BOLT_POOL 24→36 (SPREAD+OVERDRIVE saturation headroom; GDD §3.8) — recommend ACCEPT.
- boss.js L35 stale comment (says 20-HP arithmetic, shipped BOSS_HP is 60) — comment-only; boss.js is zero-diff in 019, so defer unless the player says otherwise.
- Alt-tab hold-fire input-state finding (blur clears mouseActive, not fire) — future polish list, no Stage 4 fix.
- Charged-shot fire-binding model ships as GDD §9 Decision 1 RECOMMENDATION (threshold spray-then-charge); the player verdicts it at the stage checkpoint (options + rollback = tag).
