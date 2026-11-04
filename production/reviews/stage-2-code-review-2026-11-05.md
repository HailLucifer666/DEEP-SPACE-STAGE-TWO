# Stage 2 code review — 2026-11-05 (stage close)

Scope: `git diff good-2026-11-04-g..HEAD` — stories 011–014 (main.js split, Vi3W drone,
boss fight + TD-013/014/015, victory card). Reviewer: independent lead-programmer subagent
(fresh context, read-only, kee review discipline); findings verified and dispositioned by
the orchestrator before merge. Branch: `stage-2-review-fixes` → merged `dd6c82a`,
tagged `good-2026-11-05-b`.

## Verdict (reviewer, verbatim summary)

A disciplined, well-evidenced stage: the story-011 split is a faithful move with clean
late-bound wiring and no import cycles, the boss/drone/victory features trace line-for-line
to their specs, `clearCombat` genuinely covers every new surface, and the victory/gameover
interleavings produce exactly one card in every ordering the reviewer could construct.
**No CRITICAL defect. Two IMPORTANT, four ADVISORY, five NIT.**

## Findings and dispositions (all fixed on `stage-2-review-fixes`, red-first where testable)

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | IMPORTANT | `bossDefeated` re-fired every tick after the death cinematic completed with the player dead — `deathTick`'s completion block never cleared `B.dying`, and `tickBoss` routes on `B.dying` first | **FIXED** — completion clears `B.dying`; harness drive waits 600 ms INTO the cinematic (the natural late-volley death the old early-hurt drive never exercised); `bossDefeatedReports` counter asserts exactly-once on BOTH card paths. RED `flow-red-review.txt` → GREEN 76/76 |
| 2 | IMPORTANT | flow-check's `CONSOLE []` measured only the LAST page (fault pages reset the buffer) — pages 1–3 (the whole new drone/boss/victory surface) had no console gate | **FIXED** — per-page `CONSOLE [] (flow/droneProbe/bossProbe page)` asserts; sensitivity mutation recorded (`flow-mutation-consolepage.txt`: injected error turned exactly the 4 console asserts red, 72 others stayed green). First mutation attempt corrupted the function signature — caught, repaired by hand, re-run (the invalid 12/9 run was discarded, not counted) |
| 3 | ADVISORY | Victory card froze its score BEFORE the same tick's `wavesTick` granted the wave-clear bonus — card ≠ internal final (highscore inherited the miss) | **FIXED** — `victoryFired` guard stops `wavesTick` on the victory frame; assert `card score === internal` RED (card 0 / internal 150 on the drive) → GREEN. Drive now clears raiders at boss spawn (simulates the natural wave-6 fight where the field IS clear) |
| 4 | ADVISORY | `crossfadeTo`'s catch could strand the dying bed sounding while `musicState()` honestly claims `'none'` (throw before the stop) | **FIXED** — `dyingBag` hoisted; best-effort `stop(0.05)` in the catch (catch still cannot throw). Not probe-assertable (audibility is not machine-readable) — stated in the commit |
| 5 | ADVISORY | `onResize` still touched a latched-dead composer (the TD-013 residual fix had guarded `setDpr` only) | **FIXED** — `composerIsDead()` exported from loop.js; both touch sites guarded |
| 6 | ADVISORY | Zero-length dash direction (ship parked on the boss center) froze the boss mid-dash forever | **FIXED** — made unrepresentable: non-finite/zero `dashDir` falls back to a fixed direction (the overshoot then completes). Reasoning in code: unrepresentable beats detectable |
| 7 | NIT | `enterCombat` deleted `bossProbe` but not `droneProbe` (stale report readable across runs) | **FIXED** — both deleted + `bossDefeatedReports` reset per fight |
| 8 | NIT | HUD rendered "BOSS 0%" through the whole death cinematic | **FIXED** — `barLine()` returns `''` while dying |
| 9 | NIT | `hitBoss` returned true for post-mortem hits (comment said "started the cinematic") | **FIXED** — returns true only when `startDeath` actually ran |
| 10 | NIT | `b64ToBuffer` threw synchronously on an invalid token, outside the degrade guard (unreachable via the build pipeline, defensive) | **FIXED** — decode inside its own guard; bad token degrades to proc loudly |
| 11 | NIT | Boss inner trim ring visible but not hittable (gap between node zone and hull band) | **RECORDED, no fix** — cosmetic geometry honesty; the "hole" behavior is otherwise honest. Rides Stage 3 balance if the player flags it |

## What the review confirmed held

Story-011 verbatim-move fidelity + acyclic graph · victory/gameover interleavings (exactly
one card in every ordering) · `clearCombat` completeness (every new surface drained) ·
bolt-zone geometry (no double-hit, node outranks band) · drone async pool (queue holds,
bad GLB degrades, clone userData defused) · pool contract (spawn never null, kill/clear
idempotent) · TD-013 latch honest · new asserts measure their names · zero uninvited features.
