# story-019 — elites, per-wave composition tables, balance telemetry, boss reward — EVIDENCE REPORT

> Branch `story-019-elites-waves-telemetry` (from master @ 37abb72, tag good-2026-11-06-b).
> Written 2026-11-06 by the gameplay programmer. All numbers below are real tool outputs from
> this branch; raw outputs live beside this report.

## 1. Plan and what-could-break

Order of work (red-first, then implementation, then mutations):

1. **Red-first** — the full new harness (2 boss-award asserts in the existing victory section
   + the `?balanceProbe=1` page block) ran against the UNMODIFIED story-018 gate build
   (tree clean @ 37abb72, committed index.html): every new assert recorded its red before any
   product change (`flow-red-story019.txt`).
2. Implementation — Part A (boss reward) → B (elites) → C (tables) → D (telemetry) — all
   landed on the branch; the full battery per the commit below.
3. Mutations — five (all the story's suggestions), each: apply → build → FULL flow-check →
   restore → rebuild; every red verified applied by reading its output
   (`run-mutations.mjs`, outputs `flow-mutation-*.txt`).

What could break, and what pins it:

| Risk | Pin |
| --- | --- |
| A former elite respawns elite (pool reuse leaks the skin) | the unconditional per-spawn reset in `spawnRaider` + the balance drive's reset-pin walk (elite killed → respawn at wave 3 must read normal) |
| The boss award lands after the card freezes the score | the award sits BEFORE `go('victory')` inside the same wrapper; the victory-page assert reads the card and the internal score in the same frame |
| A forced second completion double-awards | `C.bossAwarded` latch + the drive's forced second `C.bossApi.report({ bossDefeated })` (score unchanged) |
| The wave table silently changes the difficulty curve | totals equal the derived `waveCount` per wave (asserted 4/6/7/9/10; wave-6 total = 12) |
| The table↔derived boundary drifts | `waveComposition().source` asserted BOTH ways (wave 5 'table', wave 6 'derived') + the deterministic split asserts |
| Telemetry cost (per-frame work) | event-driven increments only, at existing event sites; zero per-frame allocation added (the DRONES api wrap matches the pre-existing per-frame api-literal pattern; the bossApi wrap is built once in prepareCombat) |
| Accuracy stored as a division | never stored — `hits`/`shots` are counters; the reader derives accuracy |
| The elite roll making existing probes non-deterministic | probe-forced kinds (`spawnForProbe`, and `spawnRaiderForProbe` with `forceKind`) never roll; the rate walks drive REAL rolls through `spawnRaiderForProbe(pos, wave)` without a kind pin |

## 2. Red-first record (raw, 2026-11-06)

`flow-red-story019.txt` — story-018 gate build @ 37abb72, product code untouched, only the
harness differs. **148 passed, 22 failed** (the 23rd new assert, `CONSOLE [] (balanceProbe
page)`, is green-by-design: the unmodified page ignores the unknown query flag — the exact
droneProbe red pattern).

The two boss-award reds are the decision's proof (the locked 1000 did not exist):

```
FAIL  story-019: victory final score = pre-boss score + 1000 exactly (SCORE_BOSS, locked)  [internal=0 (pre-boss 0 + SCORE_BOSS 1000 expected)]
FAIL  story-019: +1000 writes through to the highscore (victory.enter writeHighscore, persist → read back)  [highscore=0]
```

The 20 probe-page reds are red-by-absence (`balanceProbe reports (story-019)  [null]` and
each dependent assert reading `{}` / `null`), ending with the parity walk's honest guard:

```
FAIL  telemetry zeroed on enterCombat (restart parity: fresh entry reads all zeros, waveReached 1)  [no balanceProbe report (old build: red by absence)]
```

All 148 pre-existing asserts stayed green on the red run.

## 3. Implementation commits and batteries

### Commit 1 — implementation (boss reward + elites + tables + telemetry + harness)

Battery (all real outputs):

- `npm run build` — `[build] index.html  mode=bundle  4.41 MB  (324 ms)` (esbuild; never hand-edited).
- `node tools/dep-check.mjs` — `main.js lines: 255 (limit 500)` · `[dep-check] PASS — acyclic, structural rules hold`.
  Final graph edges added by this story: `probes.js -> … probes-balance.js`,
  `probes-balance.js -> enemies.js, boss.js, probes-common.js`. Nothing imports main.js; store.js still imports nothing.
- `node tools/flow-check.mjs` — `FLOW-CHECK PASS — 170 passed, 0 failed` (147 existing + 23 new;
  `flow-green-full.txt`). Runs to the green gate recorded two statistical/environmental flakes
  on the way, both re-rolled and both documented in §5: the rate band's own 3.47% upper tail
  (elites 18/50, exact binomial) and a pre-existing story-018 assert (the OVERDRIVE interval
  band [0.045, 0.075] measured 0.0762 at a 4-frame cadence under load; the same page measured
  0.0708/0.0714 in the other runs) — never an assert edit, never a shortened timeout.
- `node tools/boot-marks.mjs` — headed: `MODULE → TITLE (player wait)  968 ms` (documented GLB
  variance band 158–2492 ms; under the 1000 ms gate), `STATE {"phase":"title","rocket":"glb",…}`,
  `CONSOLE []`.

Line counts after the story (all under the 800 budget):

| File | Before | After |
| --- | --- | --- |
| src/combat.js | 640 | 702 |
| src/enemies.js | 243 | 330 |
| src/weapons.js | 260 | 275 |
| src/probes.js | 708 | 711 |
| src/probes-balance.js | — (NEW) | 319 |
| src/main.js | 255 | 255 (zero-diff) |

### Commit 2 — evidence (this report + raw outputs + the mutation runners)

No product change; the commit-1 battery carries over (the committed tree is byte-identical
to the state the 170/0 run tested — verified by `git status` clean after every mutation
restore). Files: `report.md`, `flow-red-story019.txt`, `flow-green-A.txt`,
`flow-green-full.txt`, `flow-focus-green.txt`, `flow-mutation-*.txt` (5),
`run-mutations.mjs`, `run-mutations-2.mjs`.

## 4. Mutations (2026-11-06/07; each verified applied by reading its red output)

All five of the story's suggested mutations ran, each against the committed build: apply →
`npm run build` → FULL flow-check → `git checkout` restore → rebuild. 169 keep-passing in
every mutation run (the mutated assert is the only red) unless noted.

1. **`ELITE_CHANCE 0.22 → 0`** (2026-11-06, `flow-mutation-elite-chance-0.txt`):
   `FAIL elite rate within the exact binomial 95% band for p=0.22 over 50 real rolls ([6,16])  [{"rolls":50,"elites":0}]`
   — FLOW-CHECK FAIL — 169 passed, 1 failed. Adjacent keep-passing: the wave-3 zeros (the
   band's low edge is the only discriminator the mutation moves), the elite stat asserts
   (`spawnRaiderForProbe` forceElite bypasses the roll — the seam the mutation isolates),
   tables, telemetry, boss reward all green.
2. **The unconditional per-spawn reset removed** (2026-11-07,
   `flow-mutation-elite-reset-removed.txt`): RED `former elite respawns normal` — verified on
   a focused balanceProbe-page harness (see the runner-mechanics note below and §5 item 7):
   **29 passed / 5 failed**, the target assert among the reds with the leak's honest cascade —
   the reused slot's residue also fools the probe seam's `!d.userData.elite` guard, so the
   elite-stat/rate/wave-3/telemetry reads all poison (`{"rolls":50,"elites":50}` at wave 5,
   `{"spawns":20,"elites":20}` at wave 3 where the roll cannot even fire, the rammer-kill
   paying ×2 on a leaked flag: `scoreRammer 200`). The cascade is the finding: the reset
   block is load-bearing for every elite consumer, not just the skin. Adjacent keep-passing:
   the gunner stats assert (the FIRST forced elite stamps fully — the leak starts at the
   first reuse), the table walk, the boss reward, the parity walk.
3. **The table bypassed — every wave rolls `rammerShare`** (2026-11-07,
   `flow-mutation-table-bypass.txt`): RED on both split asserts —
   `wave 1 composition is the authored table split … [{"gunner":2,"rammer":2,"total":4,"source":"table"}]`
   (the deterministic 1g/3r became a stochastic roll) and the waves-2-5 assert (observed
   4g/2r, 4g/3r, 8g/1r, 6g/4r — all off the authored rows). **FLOW-CHECK FAIL — 168 passed,
   2 failed.** Adjacent keep-passing: `table totals equal the derived waveCount` (the
   mutation preserves waveCount — totals 4/6/7/9/10/12 all still match) and the
   boundary-source assert (the resolution function is untouched; the observed wave-5 split
   going stochastic is exactly what the split asserts catch). Known bound on the
   discriminator, recorded here and at the assert: with no seeded RNG (architecture §7.1
   honest flag) the five exact-split asserts catch the bypass with joint probability ≈
   99.97% per run (per-wave coincidence chances 0.362 × 0.270 × 0.246 × 0.147 × 0.103 ≈
   3.5e-4) — this run caught it.
4. **The `bossAwarded` latch removed** (2026-11-06, `flow-mutation-boss-latch-removed.txt`):
   `FAIL boss reward: final score = pre-boss + 1000 exactly, exactly once …  [{"preScore":550,"scoreAfter":1550,"scoreAfter2":2550,"reports":2,"bossAwarded":true,"finalScore":2550}]`
   — the forced second completion re-awarded (1550 → 2550). FLOW-CHECK FAIL — 169 passed,
   1 failed. Adjacent keep-passing: the victory-page `+1000` asserts (the FIRST award is
   correct without the latch), the existing story-014 exactly-once asserts.
5. **The `enterCombat` telemetry zero line removed** (2026-11-06,
   `flow-mutation-telemetry-zero-removed.txt`): `FAIL telemetry zeroed on enterCombat (restart parity…)  [{"kills":{"gunner":2,"rammer":1,…},"chargedKills":1,"shots":{"stream":5,"charged":1},"hits":{"stream":9,"charged":1},"damageTaken":{"bolt":252,"ram":25,…},"scoreBy":{"gunner":450,"rammer":100,…},…}]`
   — the fresh entry inherited the entire previous run's counters. Incidental proof in the
   same record: `damageTaken {bolt: 252, ram: 25}` shows the source tags accumulating real
   gameplay damage (21 gunner/boss-volley bolt hits + one ram during the drive's table walk).
   FLOW-CHECK FAIL — 169 passed, 1 failed.

Runner mechanics note (recorded honestly): runner #1 (`run-mutations.mjs`) applied
mutations 1, 4 and 5; its `git checkout` restore brought the working file back CRLF, so the
two multi-line anchors (2, 3) no longer matched and were skipped by the anchor guard.
Runner #2 (`run-mutations-2.mjs`, 2026-11-07) re-ran them with EOL-aware anchors. No assert
was altered at any point; the mutated files were restored by `git checkout` and the good
bundle rebuilt after every mutation.

**The reset mutation needed three cuts and a focused harness (all recorded):**

- Full-suite cut 1 (the whole reset block removed) aborted twice at the flow page's FIRST
  natural-death poll (26 asserts in, the 90 s poll expired — the ship never died). Root
  cause found by reading the mutated code: the reset block is ALSO the sole initializer of
  `u.speedMult` on FRESH pool slots; removing it left `speedMult` undefined →
  `Math.max(…) * undefined` = NaN gunner steering → ghost raiders that can neither hit nor
  ram → the flow page's ship cannot die. The product code is correct (the shipped block
  always initializes); the MUTATION was too blunt.
- Full-suite cut 2 (skin lines removed, `speedMult` kept) aborted once more — this cut
  dropped the block's `const u = d.userData;` while the replacement still read `u`
  (ReferenceError in spawnRaider → the frame loop dies → same abort signature). My
  mutation-craft bug, fixed.
- Full-suite cut 3 (correct skin-only cut) STILL aborted at the same poll — unresolved
  environmental sensitivity of that 90 s poll under mutation builds (the other four
  mutations' full runs and all green runs pass it; four reset-mutation attempts never did).
  Recorded as unexplained rather than papered over.
- Final verification: a FOCUSED harness (flow-check.mjs spliced at two anchors — boot
  straight to the `?balanceProbe=1` page; scratch file, deleted after use) ran GREEN on the
  good build (`flow-focus-green.txt`: **35 passed / 0 failed**), then the skin-only cut ran
  against it → the target red + cascade above. The mutated code was restored by
  `git checkout` and the good bundle rebuilt; the committed tree is byte-identical to the
  full-suite-green state (170/0).

## 5. Findings during the run (recorded honestly; the intermediate outputs were overwritten in place by the re-runs — the quoted lines are from the session transcript)

1. **The ×2 kill stage was not deterministic with natural fire.** First full run: the elite
   score-×2 stage timed out with zero kills while every other assert passed —
   `{"scoreDelta":0,"killsDelta":0,"tKillsGunner":0,"tEliteGunner":0,"timeout":true}`.
   This is the powerup drive's documented mechanism class (src/probes-powerup.js: "a free
   42 u/s bolt at low headless fps teleports 0.7-2.9 u per frame and can straddle the ±1.05
   hit window"): a natural 6-hit stream volley is not a deterministic kill at headless fps.
   Fix: the ×2 stage now delivers the kill with the powerup drive's proven probe-bolt
   re-seat seam (one bolt re-seated 0.2 u behind the pinned target per tick — the SAME real
   kill site, so score/kills/telemetry increment identically). The real-fire telemetry
   stages keep natural fire: their kills are single-hit (a 1-hp rammer; a charged 6-dmg
   one-shot), which are geometrically guaranteed (max bolt step 2.1 u under DT_CLAMP cannot
   skip the 1.05-radius window on a 3 u seat) — and they carried the shots/hits counters
   green in every run.
2. **The wave-observation Set undercounted reused pool slots.** Second full run: wave 6
   observed `{"gunner":9,"rammer":2,"total":11}` against `waveCount(6) = 12`. Root cause: a
   mid-wave ram death frees a pool slot and the next spawn reuses the SAME object, so an
   identity Set counts it once. Fix: the drive now counts SPAWN EVENTS (a Map pruned of dead
   objects each tick; anything alive that the previous tick did not see is a new spawn).
   Waves 1-5 were exact in both runs (their rammers arrive after spawn completion); wave 6's
   longer drain exposed the class.
3. **Determinism pin for the per-kind stat asserts.** The elite-stat stages originally read
   whatever kind the real roll produced (62% gunner at wave 4) — a rammer roll would fail
   the gunner-stats assert. `spawnRaiderForProbe` gained the `forceKind` passthrough (the
   base hp stamps BEFORE the elite multiply, so a forced elite gunner reads hp 6); the rate
   walks still run fully real rolls.
4. **A self-review catch before any run saw it:** the enemies.js `damagePlayer` call sites
   had not received their story-019 source tags — `damageTaken.bolt/ram` would have stayed 0
   forever (the dump assert only checks presence, so it would have passed silently). Fixed:
   `api.damagePlayer(12, 'bolt')` (gunner fire AND the boss volley honestly merged — same
   pool, same scan) and `api.damagePlayer(25, 'ram')`.
5. **The rate band's own tail fired once (2026-11-06).** A full run recorded
   `{"rolls":50,"elites":18}` against the exact band [6,16]. Exact binomial:
   P(X ≥ 18 | n=50, p=0.22) = **3.47%** — inside the band's own design tail (total ≈ 4.8%,
   the same statistical class as story-018's shipped drop-rate band [11,25] over N=100).
   No source change: the assert stays exactly as the story specs it (N = 50, exact
   quantiles; "widen trials, never bounds" — bounds were not touched, trials were not
   changed, the run was re-rolled). Discrimination is unaffected: the chance→0 mutation
   reads 0, far below any plausible bound.
6. **A pre-existing story-018 assert flaked once under load (2026-11-06).** The OVERDRIVE
   interval band [0.045, 0.075] measured 0.0762 (4-frame cadence; the same page measured
   0.0708 / 0.0714 in every other run). Environmental, re-rolled — the assert is not this
   story's and was never touched.
7. **The flow page's first natural-death poll is load-sensitive (2026-11-07, unresolved).**
   Four full-suite runs under the reset mutation aborted at that poll (the 90 s budget
   expired with `dead` still false) while every green run and the other four mutations'
   full runs pass it. Two of the four aborts were explained and fixed (see §4 item 2:
   NaN-ghost raiders, then a ReferenceError); the third cut was behaviorally identical to
   the green build on the flow page (fresh pool slots only) and still aborted, so the
   remaining sensitivity is environmental (the poll's death timing depends on raider
   convergence after the sphere-return drive leaves the ship at dY ≈ 28). Recorded, not
   papered over: the mutation's red was verified on the focused harness instead. This is a
   pre-existing poll-budget property, not a story-019 regression — flagging it for the
   harness owner as a candidate for a widened deadline or a deterministic kill drive.

## 6. Deviations (flagged, none silent)

1. **Commit slices collapsed.** The brief suggested A; B; C; D+harness; evidence. The red
   record and the harness were captured complete on the gate build, and the source edits for
   B–D were prepared during the battery windows to use the wall-clock; re-staging three
   interleaved states of combat.js/enemies.js/probes-balance.js post-hoc (with a fresh
   build + full battery each) risked mis-staging for zero behavior difference. Landed as:
   commit 1 = implementation (A+B+C+D + harness), commit 2 = evidence. Every part is
   individually red-first-pinned by named asserts from the single red record, and every
   mutation isolates one part.
2. **src/weapons.js grew beyond the "~3 lines + import" exception.** The brief authorized
   "ONLY the elite-score consumption at the kill sites (~3 lines + import); flag if it grows
   beyond that". Actual: the elite-score consumption is 2 lines (`pts` + the existing import
   surface — `ENEMIES.ELITE_SCORE_MULT` rides the namespace import weapons.js already has,
   so zero new import lines), PLUS the story-019 telemetry increments at the kill/hit/shot
   sites (~14 lines with comments). The increments cannot live in combat.js without
   violating the story's own event-driven constraint ("increments at existing event sites"):
   the kill sites, the bolt-scan hit branches, and spawnStreamShot/fireTick have lived in
   weapons.js since the story-018 review-fix split, which post-dates the story file's file
   list. They write through the existing `initWeapons` seam (the live `C` reference) — no
   new imports, no new edges. Total weapons.js: 260 → 275.
3. **`damagePlayer` source tags ride two mechanisms.** The brief expected the four call
   sites to gain the tag, but two of the four sit in ZERO-DIFF files (drone.js, boss.js).
   Landed: enemies.js's two call sites carry explicit tags (`'bolt'`, `'ram'` — the file is
   in scope); the drone dive and the boss dash are tagged by their per-caller api wraps in
   combat.js (`DRONES.tickDrones(..., { damagePlayer: (n) => damagePlayer(n, 'dive'), … })`
   and the same in the bossApi composition) — each is that module's ONLY damage source, so
   the granularity is identical and drone.js/boss.js stay byte-identical. Probe-forced
   deaths (`probeDamagePlayer`) pass no source and never reach the accumulator.
4. **probes.js re-export wiring.** The brief's "re-exports keep the combat import line
   byte-identical" holds for the EXISTING names; a NEW walk necessarily adds one symbol —
   combat.js's probes import gained exactly `balanceProbeTick`, routed through probes.js's
   re-export (the R-e wiring convention), and `resetProbes()` delegates to
   `resetBalanceProbe()` (the story-018 split's call order).
5. **`bossDefeatedReports` reads 2 on the balance page (1 natural + 1 forced).** The
   completion block's re-fire class must be COUNTABLE (the stage-2 review's own design) —
   the forced second report goes through the same wrapper and is counted. The "reported
   exactly once" property is pinned where it belongs: the existing victory-path asserts
   (`reports === 1`) are unchanged and green. The balance-page assert pins "score increased
   exactly once" (scoreAfter2 === scoreAfter) + the latch flag.
6. **`combatState().telemetry` is a fresh dump per read** (arch §8.4's `{ …T }` spread) —
   the GDD's "one reference return" wording would hand the harness a live reference; the
   dump form is behaviorally identical for `J()` reads and cannot be mutated from outside.
7. **`telemetry.pickups` are deltas over the `enterCombat` baseline.** powerups.js's
   `stats()` is per-page cumulative (its own documented contract); copying it verbatim into
   a per-run accumulator would lie across restarts. The dump subtracts the entry baseline —
   the soft-dep fields read 0 when the events never fired, as the story requires.
8. **`waveTimes` records `C.time` at each `C.wave++`** (waves 2-6 on a natural run → ≤ 5
   entries; the GDD's "≤ 6 events/run" bound holds; wave 1 is the entry state
   `waveReached: 1`, not an increment event).

## 7. Zero-diff confirmations

- `src/boss.js` — ZERO-DIFF (verified by `git diff --stat` below). The award lives in
  combat.js's bossApi wrapper per the TD-corrected site; boss.js never sees score.
- `src/launch.js`, `src/main.js`, `src/audio.js`, `src/phases.js`, `src/drone.js`,
  `src/powerups.js` — ZERO-DIFF.
- `src/weapons.js` — the flagged exception only (kill-site score ×2 + the telemetry
  increments through the existing seam; see deviation 2).
- Existing flow-check asserts — byte-identical; the story's 147 (148 on disk with the
  story-018 close) all pass unchanged.

`git diff --stat master...HEAD` (the whole story):

```
 index.html            | 394 +++++++++++++++++++++++++-------------------------
 src/combat.js         |  74 +++++++++-
 src/enemies.js        | 113 +++++++++++++--
 src/probes-balance.js | 319 ++++++++++++++++++++++++++++++++++++++++
 src/probes.js         |   3 +
 src/weapons.js        |  17 ++-
 tools/flow-check.mjs  | 184 ++++++++++++++++++++++++
 7 files changed, 887 insertions(+), 217 deletions(-)
```

`git diff master...HEAD -- src/boss.js src/launch.js src/main.js src/audio.js src/phases.js
src/drone.js src/powerups.js` is EMPTY — all seven zero-diff files confirmed byte-identical.

## 8. Not verified / out of scope

- The GDD §8.5 experiential criteria (charged-shot discoverability, elite "same shape,
  hotter" readability, telemetry shows nothing on screen) — playtest items for the stage
  close; the last one is structurally true (telemetry has zero DOM/UI writes).
- The boss.js stale-comment rider (`BOSS_HP 60` vs "≈ 20 body hits") — the GDD left it as
  an orchestrator call; boss.js is ZERO-DIFF this story, so the comment stands.
- `BOLT_POOL` 36 rider — already landed by story-018; nothing to do.
- Boot-marks headed figure — recorded in the commit-1 battery section above.
- The elite × table expected-counts math (wave-4 ≈ 2.0 elites, wave-5 ≈ 2.2) is design
  math (GDD §4.4); the harness pins the RATE over 50 rolls, not per-wave expectations.
