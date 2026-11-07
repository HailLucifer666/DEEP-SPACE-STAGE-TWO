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
| story-019 elites/tables/telemetry/reward | done | merged bc3c472, tag good-2026-11-07 (2026-11-07). Boss reward 1000 flat (LOCKED) in the report wrapper with C.bossAwarded latch + telemetry scoreBy.boss; elites (raiders only, wave ≥ 4, 0.22, unconditional reset); wave tables 1-5 authored (totals = derived), boundary asserted both ways; 12-group telemetry accumulator. flow-check 147→170. Review chain: spec (dead scoreBy.boss + band math fixed red-first) + quality (dead-radius records corrected per ruling; single-source boundary; guards; watchdogs) + THE MERGE HALT: the elite-rate band reded 3× (18-20/50 vs p=0.22) → per-roll instrumentation proved the mechanism EXACT (350/350 draw↔flag agreement) and the ENVIRONMENT's Math.random delivers run-level clustered batches (captured 3.4σ batch; root cause open, environment finding). Distribution gate replaced by mechanism gates + exact 99.9% sanity band [3,21]; ELITE_CHANCE→0 mutation re-verified RED. Merge battery: 169/1 (documented joint statistical-flake class ~14%) then 170/0 captured; boot 3328 ms sample = gltf.parse variance under load. |
| Stage close (review, smoke, changelog, GATE) | done 2026-11-07 | Independent whole-stage review: gate-ready on substance, 12 findings (0 code defects; bookkeeping closed at the gate: TD-003 register row, LEDGER W3, BACKLOG dead items, story-019 AC amended, architecture/powerups/GDD doc reconciliations). Smoke record: production/qa/smoke-2026-11-07-stage4.md (170/0, dep-check 255, restartProbe=3 clean entities 39 = 33+6, boot 439 ms). CHANGELOG Stage 4 section. GATE.md: PASS (machine gates) — player checkpoint pending. |

# STAGE 4 DONE (machine gates) — 2026-11-07
Tags: good-2026-11-06 (R-c) · good-2026-11-06-b (018) · good-2026-11-07 (019).
flow-check 114 → 170 asserts. Scoreboard: 19/20 stories; stages 0-4 closed.
Remaining: Stage 5 (story-020 settings persistence + README/deploy + host choice) + the
two owner chores (TD-007 git identity, TD-08 build litter) + the checkpoint items
(verdicts, flake policy, hint text, E.lastRoll) recorded in GATE.md.
CHECKPOINT 2026-11-07: dialog presented — UNANSWERED (stage-3 precedent). Working
defaults recorded in GATE.md; Stage 5 NOT STARTED (opens on the player's word).

Extra riders recorded at R-c close (2026-11-06):
- flow-check.mjs is 1641 lines at stage close (1147 at the R-c close review; story-018/019 added the charge/powerup/balance blocks) vs the 800-line file budget — if the budget covers tooling, a flow-check decomposition is a future R-series target (stage-review finding 9; not this stage).
- Pre-existing stale comment (main.js rocketMetrics "expect [-0.8]" vs real [0,-0.8]) — reported by the implementer, untouched (out of blast radius).
- BOLT_POOL 24→36 rides story-018 (orchestrator-accepted per GDD §3.8 recommendation; player may veto at the checkpoint — rollback = tag).
- E.lastRoll (the merge-halt diagnostic's per-spawn record in src/enemies.js ~196-200) ships unconditionally in production — behavior-identical, event-frequency, but it is a permanent allocation serving an open environment diagnostic. DECISION ITEM at the checkpoint: gate it behind the balance-probe flag, or keep it until the Math.random batching finding closes (stage-review finding 6).
- Hint bar announces the charge shot ("HOLD = CHARGE SHOT") while GDD §8.5's discoverability item measures unprompted discovery — the shipped UI pre-empts that AC as written. DECISION ITEM: re-word the §8.5 item (measure suppression-reads-as-charging + chip legibility) or drop the explicit charge mention from the hint bar (stage-review finding 3).

Riders flagged (player calls at the checkpoint, not silent):
- BOLT_POOL 24→36 (SPREAD+OVERDRIVE saturation headroom; GDD §3.8) — recommend ACCEPT.
- boss.js L35 stale comment (says 20-HP arithmetic, shipped BOSS_HP is 60) — comment-only; boss.js is zero-diff in 019, so defer unless the player says otherwise.
- Alt-tab hold-fire input-state finding (blur clears mouseActive, not fire) — future polish list, no Stage 4 fix.
- Charged-shot fire-binding model ships as GDD §9 Decision 1 RECOMMENDATION (threshold spray-then-charge); the player verdicts it at the stage checkpoint (options + rollback = tag).
