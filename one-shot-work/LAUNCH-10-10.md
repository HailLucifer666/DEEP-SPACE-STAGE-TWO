# STAGE TWO — LAUNCH 10/10 MASTER PLAN

> **Bootstrap for every AI session — read this first.**
> Then read the top line of `one-shot-work/LEDGER.md`, run Section 2 reconciliation, claim exactly one CRITICAL task, and stop after its report. Do not read the whole repo. Do not start a second task.
>
> **Seed file:** `C:\Users\acarg\.opencode\plan\STAGE-TWO-LAUNCH-10-10.md`
> **Canonical repo file after first Build action:** `E:\Game Build\one-shot-work\LAUNCH-10-10.md`
> **Add this pointer to `CLAUDE.md`:** `LAUNCH PROTOCOL: read one-shot-work/LAUNCH-10-10.md before any task.`
> **Created:** 2026-11-06
> **Owner:** project owner
> **Status:** RECONCILED 2026-11-06 (bootstrap session, HEAD `5ae021e`) — see `one-shot-work/LEDGER.md` STOP block. Story-018 has an unrestored mutation in the working tree; W2 merge is blocked until it is restored and re-verified.

---

## 0. Mission

Ship STAGE TWO as a **10/10 launch-ready** browser micro-game: verified, documented, deployable, and safe to hand to a reviewer.

**Critical path only.** No new features, refactors, or polish unless a 10/10 scorecard dimension is below target and the fix is the smallest task that moves it. Everything else goes to the post-launch backlog.

**Current overall estimate:** 7/10 as a game, ~6.5/10 as a launch package. Target: 10/10 on every gate in Section 7.

---

## 1. Non-negotiable rules

1. **One writer per repo at a time.** Claim `one-shot-work/.active-session` before any work. If it exists and is under 30 minutes old, stop. If stale, verify no build/test/Edge process is running, clear it with a note.
2. **Never build or run flow-check while another session is building or testing.** flow-check uses fixed port 9941; concurrent runs collide.
3. **Do not switch branches with a dirty tree.** Do not `git reset --hard`, force-push, stash, rebase, or delete untracked work.
4. **`index.html` is generated.** Never hand-edit it. Run `npm run build` after every source change.
5. **Red-first.** Every new assert must fail on the old build for the stated reason. A check never seen red is not evidence.
6. **Never weaken, delete, or loosen an existing assert or bound.** If a test and the task disagree, stop.
7. **No new dependencies, engine changes, renames, or refactors** unless the task card explicitly allows them.
8. **One task per session.** Restate the task in two lines, do it, report, stop.
9. **Two failed attempts on the same problem = stop and report.** No third hack.
10. **Never claim a visual result.** The human is the eyes. Save screenshots to `build/shots/`.
11. **Show raw output** for build, dep-check, flow-check, and boot-marks. A summary is not output.
12. **Never delete `build/.edge-profile-*` or any untracked work** without explicit owner go-ahead.
13. **Never rewrite git history.** TD-007 is owner-only, after a backup.
14. **If the working tree changes unexpectedly, stop and report.** Do not "fix" another session's work.
15. **Back up before any merge or release:** `git bundle` plus a working-tree copy excluding `build/.edge-profile-*`, `node_modules`, and `.cache`.

---

## 2. First action: reconcile — do this before any task

Run these commands and fill the status table in Section 3. Do not trust the owner report, the handoff, or another session's UI. Trust the disk.

```powershell
cd "E:\Game Build"
git status --short --branch
git log --oneline -15
git tag --sort=-creatordate | Select-Object -First 12
git worktree list
Get-ChildItem production\epics\combat-feel-fix\story-02*.md | Select-Object Name
Test-Path README.md
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*edge-profile*' } | Select-Object ProcessId, Name
```

**Conflict rule:** the owner reports 3/7 complete (W1 R-c, W2 story-018, W3 story-019) and W4 waiting. The last disk check by this plan (2026-11-06) showed story-018 still uncommitted, story-019 not started, and no story-020 file. These cannot both be true. Reconcile first.

- If W1–W3 are merged and tagged, record the tags and close them.
- If they are not, treat them as OPEN and use the tactical cards in `one-shot-work/PLAN-2026-11-06.md`.
- **Do not start W4 until W1–W3 are proven merged/tagged.**

**Concurrency rule:** if another session is active, do not build, test, merge, or edit shared files. Wait for a clean commit/merge checkpoint, or work only in a separate worktree after owner approval.

---

## 3. Status table — the 7 workstreams

| ID | Workstream | Owner report | Last disk check (2026-11-06) | Verified |
|---|---|---|---|---|
| W1 | R-c `main.js` refactor | DONE | tag `good-2026-11-06`, merge `1cb07a3`, master = `27e4a61` | [x] |
| W2 | Story-018 charged shot + pickups | DONE | branch `story-018…` @ `5ae021e` (commits `7127443` + `5ae021e`); **NOT merged** (master = `27e4a61`); report.md IN PROGRESS; **unrestored mutation in tree** | [~] blocked |
| W3 | Story-019 elites / waves / telemetry / boss reward | DONE | story file exists; no branch; no code | [ ] todo |
| W4 | Story-020 settings persistence + accessibility | WAITING | **no story-020 file** | [ ] blocked |
| W5 | Stage 4 close | TODO | not started | [ ] |
| W6 | Stage 5 ship prep | TODO | README missing; no deploy | [ ] |
| W7 | Release gate | TODO | no `release-1.0` | [ ] |

**Overall score:** 7/10 (last known) → target 10/10.

---

## 4. Critical path

```
W1 verify → W2 verify → W3 verify → W4 → W5 → W6 → W7 → release-1.0
```

No parallel workstreams. No optional polish before W7. If a 10/10 gate is below target, promote the smallest fix to CRITICAL with an owner note; everything else waits.

**Cut line:** W1–W3 verification, W4, W5, W6, W7 are never cut. Optional R/V/A/G tasks are cut from the bottom of the post-launch backlog.

---

## 5. Per-workstream cards

### W1 — Verify R-c (`main.js` refactor)

- Verify merge `1cb07a3`, tag `good-2026-11-06`, `main.js` ≤500 lines, `node tools/dep-check.mjs` PASS.
- Verify the latent N-key crash fix and its regression assert (`flow-check` 115 asserts at that point).
- If missing, stop and report; do not redo the refactor.
- **Exit:** tag + dep-check output recorded in Section 8 evidence.

### W2 — Verify story-018 (charged shot + pickups)

- Verify merge/tag, battery green, `production/qa/evidence/story-018…/report.md` sections 3–5 complete, mutation records actually run.
- If commit 2 is still uncommitted, use the recovery plan cards T-018-A…T-018-E. Do not start W4 until merged/tagged.
- **Exit:** tag, flow-check green, report complete.

### W3 — Verify story-019 (elites, wave tables, telemetry, boss reward)

- Verify merge/tag and acceptance criteria:
  - Boss reward: `SCORE_BOSS = 1000` in `src/combat.js`, awarded exactly once in the `bossApi.report` `bossDefeated` branch, before the victory frame; `boss.js` zero-diff.
  - Elites: wave ≥4, chance 0.22, raiders only, HP ×3, speed ×1.15, scale ×1.35, score ×2, tint `0xffa02f`, unconditional reset.
  - Wave tables: waves 1–5 totals equal derived; wave 6+ fallback.
  - Telemetry: 12-group event-driven accumulator, or documented cut with owner approval.
- **Exit:** tag, flow-check green, story/EPIC updated.

### W4 — Story-020 settings persistence + accessibility

- Create/verify `production/epics/combat-feel-fix/story-020-settings-persistence.md`.
- Scope: persist mute/volume, reduced motion, quality; honor `prefers-reduced-motion`; pause-menu settings.
- **7-step pipeline:** implement → spec review → quality review → battery → merge `--no-ff` → tag → docs.
- **Red-first:** settings do not persist on the old build; reduced motion is ignored.
- **Files:** `src/store.js`, `src/input.js`, `src/audio.js`, `src/hud.js`, `tools/index.template.html`, `src/combat.js` only if required, `tools/flow-check.mjs`.
- **Exit:** AC met, merged/tagged, battery green, story closed.

### W5 — Stage 4 close

- Independent Stage 4 review (spec + quality + stage pass).
- Smoke record.
- Changelog entry.
- `GATE.md` with PASS/CONCERNS and known limitations.
- Owed playtest verdicts: pitch/drift/arena/first-climb, charged-shot discovery, pickup legibility, elite readability, telemetry invisibility.
- Update EPIC/story statuses.
- **Exit:** `GATE.md` committed; no open S1.

### W6 — Stage 5 ship prep

- **S-01 Release verification:** size, cold `file://` console, Edge/Chrome/Firefox, 1366×768 / 1920×1080 / 4K, one trackpad run.
- **S-02 README:** pitch, GIF/video, play link, controls table, 5-minute tour, how it was built, module map, build/test, credits, known limitations, next steps.
- **S-02b Docs pack:** generate the 13-file handoff pack at `docs/handoff/` from verified state (PRD, MVP, tech stack, architecture, code map, build/release, current state, roadmap, QA, decisions, index, README).
- **S-03 Recording:** ~45 s, under 10 MB or unlisted link.
- **S-04 Hosting:** GitHub Pages / itch.io; decide `index.html` tracking (release-only vs every commit).
- **S-05 Git identity:** owner-only; prefer a fresh snapshot repo over history rewrite; verify `git log --format='%an %ae' | sort -u`.
- **S-06 `.gitignore`/litter:** cover all `build/.edge-profile-*`; delete only with explicit go-ahead.
- **S-07 License/hygiene:** MIT code; asset credits; secrets/personal-path scan.
- **S-08 Submission note:** what it is, how to run, what to look at, honest AI-assistance statement.
- **Exit:** README, credits, recording, live URL, clean identity, docs pack.

### W7 — Release gate

- **F-01** Full battery on master: `npm run build`, `node tools/dep-check.mjs`, `node tools/flow-check.mjs`, `node tools/boot-marks.mjs headed`.
- Cold-machine run from a different folder by double-click.
- Stranger playtest: 5 minutes, say nothing, watch where they get stuck.
- **F-02** Tag `release-1.0`; record SHA in `LEDGER.md`.
- **F-03** Freeze: only S1 showstoppers via task cards.
- **F-04** Backup release folder + `index.html` outside the repo.
- **Exit:** tag, checklist, backup.

---

## 6. The 7-step pipeline (every story/task)

1. **Implement** — branch from master, one card, allowed files only, diff budget.
2. **Spec review** — independent reviewer checks: files outside allowed, behavior changes not on card, tests/bounds weakened, per-frame allocations, visual claims.
3. **Quality review** — second independent pass: correctness, edge cases, performance, maintainability, regressions.
4. **Gates** — `npm run build`; `node tools/dep-check.mjs`; `node tools/flow-check.mjs`; `node tools/boot-marks.mjs headed`; plus the task probe.
5. **Merge** — `git merge --no-ff`; tag the next chain tag; re-run the battery on master.
6. **Docs** — update report, evidence, changelog, ledger.
7. **Close** — update this file's status table; release the lock; stop.

**Reviewer prompt (paste with the diff only):**
```
Check this diff against the task card. List: (a) files touched outside ALLOWED,
(b) behaviour changes not on the card, (c) tests or bounds weakened,
(d) per-frame allocations added, (e) any claim about visuals.
Verdict: MATCH or DRIFT, with line references.
```

---

## 7. 10/10 launch scorecard

| # | Dimension | 10/10 means | Current | Gate |
|---|---|---|---|---|
| 1 | Functional completeness | All 20 stories closed or owner-descoped; full loop works | TBD | W5/W7 |
| 2 | Stability | Zero console errors/warnings on cold `file://`; no stuck overlays; restart ×5 baseline clean | TBD | W7 |
| 3 | Performance | Boot <1000 ms; 60 fps target; no >10% regression; bundle ≤6 MB | TBD | W7 |
| 4 | Controls/onboarding | Stranger fires/steers/finds enemies within 30 s; pause/mute obvious | TBD | W5 |
| 5 | Visual quality | No placeholder moments; consistent art; boss/readability pass | TBD | W5 |
| 6 | Audio quality | No clipping/missing cues; music/SFX balanced; mute works | TBD | W5 |
| 7 | Documentation | README, credits, controls, build/test, limitations, docs pack | TBD | W6 |
| 8 | Repo/deploy | Clean identity, no secrets, no 8 GB litter, live URL, backup | TBD | W6 |
| 9 | Verification | Battery green; red-first evidence; mutation records honest | TBD | W7 |
| 10 | Release readiness | `release-1.0` tag; backup; submission note; freeze | TBD | W7 |

**Scoring rule:** a dimension is 10 only when its gate has raw evidence. No partial credit for "looks good." If a dimension is below 10, the smallest critical task that moves it becomes the next task. Optional polish that does not move a dimension stays in the post-launch backlog.

---

## 8. Session protocol

### Start of session

1. Read this file.
2. Read the top line of `LEDGER.md`.
3. Check `one-shot-work/.active-session`; if held, stop.
4. Run Section 2 reconciliation.
5. Claim exactly one CRITICAL task; write the lock file:
   ```
   session: <id>
   task: <ID>
   started: <timestamp>
   branch: <branch>
   ```
6. Restate the task in two lines.

### End of session

1. Run the battery/probe; capture raw output.
2. Commit; merge/tag only if authorized.
3. Update this file: status, evidence, next critical task, handoff.
4. Release the lock.
5. Report in the required format.
6. Stop. Do not start another task.

### Report format

```
TASK / BRANCH / COMMIT
FILES CHANGED (raw git diff --stat)
RED proof (raw)
GREEN proof (raw build, dep-check, flow-check, boot-marks)
WHAT THIS DOES NOT COVER
FOUND-BUT-NOT-FIXED (BACKLOG lines)
FOR THE HUMAN (screenshot paths)
NEXT CRITICAL TASK
```

---

## 9. Crash avoidance and concurrency

- **One writer, one builder, one flow-check at a time.** flow-check uses fixed port 9941. Two sessions = stale Edge tree, `0 passed, 0 failed`, poll timeouts.
- Before a battery, check for `*edge-profile*` msedge processes. Kill only your own stale tree; never another session's.
- If `flow-check` shows `0 passed, 0 failed` or a poll timeout: kill lingering `*edge-profile*` msedge, verify port 9941 is free, rerun once. Rate asserts (binomial bands) can flake ~5%: rerun once, never widen bounds.
- If another session is mid-merge, wait. Do not rebase, reset, or merge over it.
- If the working tree has unexpected changes, stop and report. Do not stash or clean.
- Backup before W7: `git bundle create` + working-tree copy excluding `build/.edge-profile-*`, `node_modules`, `.cache`.
- Rollback = `git checkout <last good-tag>`; never destructive reset.
- Do not delete `build/.edge-profile-*` during a session; that is an owner-approved chore (TD-08).

---

## 10. Stop conditions

Stop immediately and report if:

- Another session holds the lock or is writing.
- `git status` shows unexpected changes.
- The battery fails twice for the same reason.
- A task exceeds its diff budget or touches a forbidden file.
- A test or bound must be weakened to pass.
- A visual result is claimed without a screenshot.
- A decision is needed (scope, telemetry, assets, hosting, identity).
- The task is not on the critical path.

---

## 11. Open decisions (owner)

| ID | Decision | Needed by | Status |
|---|---|---|---|
| D1 | Story-020 scope: settings persistence + accessibility | W4 start | open |
| D2 | Telemetry: keep or cut; if cut, update story-019/EPIC | W3/W5 | open |
| D3 | Vi3W assets: one or two; which (recommend gunner, then rammer) | W6 | open |
| D4 | Hosting: GitHub Pages / itch.io; `index.html` tracking | W6 | open |
| D5 | Git identity: rewrite vs fresh snapshot | W6 | open |
| D6 | B-05 probe stripping: do or document | W6 | open |
| D7 | Release tag date/name | W7 | open |

---

## 12. Post-launch backlog (NOT critical)

Do not start these before `release-1.0`:

- B-05 strip probes from release build (or document that probes ship).
- R-02 off-screen indicators for orbs/boss; R-03 arena proximity cue; R-04 contextual hints; R-05 alternate fire key; R-06 pickup shapes; R-07 reduced motion/volume; R-08 pause menu; R-09 damage wedge.
- V-01 environment map; V-02 nebula; V-03 star parallax; V-04 combat engine flame; V-05 bolt look; V-06 hit feedback; V-07 death effect; V-08 shield bubble; V-09 post-lite; V-10 speed lines; V-11 boss presentation; V-12 wave banner; V-13 quality toggle.
- A-01/A-02/A-03 audio polish.
- G-02 elites / G-03 wave tables / G-04 tuning (unless a 10/10 gate requires them).
- Extra Vi3W assets beyond the one or two chosen.

If a scorecard dimension is below 10 and one of these is the smallest fix, promote it to CRITICAL with a dated owner note in this file.

---

## 13. Evidence and report format

| Evidence | Location |
|---|---|
| Red/green/mutation outputs | `production/qa/evidence/<story>/` |
| Spec/quality/stage reviews | `production/reviews/` |
| Phase gates | `one-shot-work/stage-N/GATE.md` |
| Screenshots | `build/shots/` |
| Changelog | `CHANGELOG.md` |
| Live status | `one-shot-work/LEDGER.md` / `one-shot-work/BACKLOG.md` |
| This plan | `one-shot-work/LAUNCH-10-10.md` |

---

## 14. First five commands for a new session

```powershell
cd "E:\Game Build"
Get-Content one-shot-work\LAUNCH-10-10.md -TotalCount 80
Get-Content one-shot-work\LEDGER.md -TotalCount 3
git status --short --branch
Get-ChildItem one-shot-work\.active-session -ErrorAction SilentlyContinue
```

If the lock is free and the tree is clean, run Section 2 reconciliation and claim the next CRITICAL task. If not, stop and report.
