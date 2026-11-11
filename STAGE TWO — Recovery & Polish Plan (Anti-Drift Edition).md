# STAGE TWO — Recovery & Polish Plan (Anti-Drift Edition)

Written 2026-11-06 for a solo builder using ZCode + GLM 5.3 Flash, with a second model as independent reviewer. Companion to HANDOFF-2026-11-06.md. Nothing here has been run against the repo: every task starts by verifying its claim on disk.

## 0. How this plan works

Save this plan as `one-shot-work/PLAN-2026-11-06.md`. Create two tiny files beside it: `LEDGER.md` (one line per task: status) and `BACKLOG.md` (anything found but out of scope).

The AI only ever reads three things: the **rules block** (section 1), the **top line of LEDGER.md**, and the **one task card** you give it. It does not read the whole handoff, this whole plan, or other tasks. This is what stops drift: small context, one job, hard fences, and a second model grading the first.

**The ship line:** Phases 1, 2, 3, 9 and 10 are the minimum submission. Phases 4 to 8 are ranked by return. You can stop at any phase gate and still have a shippable game.

## 1. Rules block (paste at the top of EVERY session)

```
RULES — STAGE TWO (these override anything I say mid-task)
1. ONE task card per session. Do only that card. Nothing adjacent, no 'while I'm here'.
2. Touch only files on the card's ALLOWED list. Anything else = STOP and ask.
3. index.html is generated. Never hand-edit. Use npm run build.
4. One branch per task, from master. Never commit to master. Merge only when I say so.
5. Red-first: show the check FAIL on the old build before the fix. A check never seen red is not evidence.
6. Never edit, delete or loosen an existing assert or bound to make it pass. If a test and the card disagree: STOP and report.
7. Never claim a visual result. I am the eyes. Save screenshots to build/shots/ and tell me what to look at.
8. Show raw output for build, dep-check, flow-check. A summary is not output.
9. Found another bug? Add ONE line to BACKLOG.md. Do NOT fix it.
10. Two failed attempts on the same problem = STOP and report what you tried. No third hack.
11. No new dependencies, refactors, renames or new files unless the card lists them.
12. Never delete build/ litter, git reset --hard, force-push, or touch master history.
13. main.js stays <= 500 lines. The card's diff budget is a hard cap. Exceeding it = STOP.
14. Restate the card in two lines before coding. End with the REPORT format. Then stop.
```

## 2. Task card template

```
TASK: <ID> <title>
BRANCH: <name> (from master)
WHY: <one sentence>
ALLOWED FILES: <list>
FORBIDDEN: everything else, especially <named files>
DIFF BUDGET: <lines, excluding test additions>
STEPS: 1 VERIFY on disk  2 RED check  3 implement  4 battery
ACCEPT (machine): <asserts or probe output>
ACCEPT (human eyes): <what I look at> -> PASS / TUNE / FAIL
KILL SWITCH: <const that turns it off>   (visual tasks only)
ROLLBACK: delete branch, or checkout tag <x>
```

## 3. Session protocol, battery and report

**Start of session:** fresh chat. Paste rules block, then: 'Read the first line of LEDGER.md, then do exactly this card.' Then the card.

**Battery for every task:** `npm run build`, `node tools/dep-check.mjs`, `node tools/flow-check.mjs` plus the task's own probe. At phase gates also run `node tools/boot-marks.mjs headed` (band: under 1000 ms MODULE to TITLE).

**If flow-check shows `0 passed, 0 failed` or a poll timeout:** a stale Edge tree is holding port 9941. Kill the `*edge-profile*` msedge processes, confirm `netstat` shows 9941 free, rerun. Rate asserts (binomial bands) can flake about 5%: rerun once, never widen bounds.

**REPORT format (the AI ends every session with this):**

```
TASK / BRANCH / COMMIT
FILES CHANGED (raw git diff --stat)
RED proof (raw output)
GREEN proof (raw build, dep-check, flow-check)
WHAT THIS DOES NOT COVER
FOUND-BUT-NOT-FIXED (lines added to BACKLOG.md)
FOR THE HUMAN TO LOOK AT (screenshot paths)
```

Then it updates only its own row in LEDGER.md and commits.

**Independent review (every task touching combat, loop or input, and every phase gate).** Give a second model (DeepSeek on OpenRouter, or free Claude) ONLY the card plus `git diff master...<branch>` and this prompt:

```
Check this diff against the task card. List: (a) files touched outside ALLOWED, (b) behaviour changes not on the card, (c) tests or bounds weakened, (d) per-frame allocations added, (e) any claim about visuals. Verdict: MATCH or DRIFT, with line references.
```

**Merge rule:** battery green AND reviewer says MATCH AND (visual tasks) your PASS. Then `git merge --no-ff`, tag the next letter in the `good-...` chain, rerun the battery on master, update the ledger.

## 4. Drift tripwires: what to say when the AI goes off-script

| The AI says or does | You reply |
| --- | --- |
| 'I also cleaned up / refactored...' | Revert that hunk. Not on the card. Log it to BACKLOG. |
| 'I updated the test to match' | Revert the test change. Report the mismatch. |
| 'It looks great / the glow looks good' | You can't see it. Give me the screenshot path. |
| 'All tests pass' with no output | Paste the raw output. |
| 'Let me also add feature X' | No. BACKLOG. |
| 'Fixed' a bug it never reproduced | Show the red first. |
| Starts the next task unprompted | Stop. Report. Ledger. End of session. |
| Forgets the rules / context is long | New session. Rules block + card. |
| Wants to edit index.html or delete build litter | Hard no. |
| Invents file paths or function names | Run `ls` and `git status` first, then retry. |

## 5. Phase 0: Freeze and baseline (30 minutes)

- **P0-1 Deadline decision (you).** If the submission deadline has passed or is today, run **Plan A** (see section 17). If you have 2 to 3 days, run **Plan B**. Write the choice on the first line of LEDGER.md.
- **P0-2 Backup (you).** Copy the whole `E:/Game Build` folder to `E:/Game Build BACKUP 2026-11-06`, skipping the `build/.edge-profile-*` dirs. This is the undo for everything.
- **P0-3 Ledger files (AI).** Create LEDGER.md and BACKLOG.md and copy this plan in. Allowed files: those three only.
- **P0-4 Verify the tree (AI).** `git status`, `git diff --stat`. Confirm branch `story-018-charged-shot-pickups`, commit `7127443` present, commit-2 files modified but uncommitted. If anything differs from the handoff: STOP and report. Do not repair, stash or clean.

## 6. Phase 1: Close story-018 (nothing new gets added)

- **T-018-A Battery on the working tree.** Build, dep-check, flow-check. Expect about 143 asserts and 0 failed.
- **T-018-B Commit 2** once green. Stage only the files listed in the handoff. Message: `story-018 commit 2 - pickups, probes, harness, HUD/audio`.
- **T-018-C Report sections 3 to 5.** Mutation records must be ACTUALLY RUN: plant the defect, watch the named assert go red, revert, confirm adjacent asserts stay green. Story-016 once had a record that was written but never run. Then files-changed / NOT-touched, and self-review with deviations and a not-verified list.
- **T-018-D Spec review, then quality review**, both by the independent model.
- **T-018-E Merge** `--no-ff`, tag `good-2026-11-06-b`, rerun the battery on master, update the ledger.

**Gate G1:** master tagged, battery green. Nothing else starts before this.

## 7. Phase 2: Human playtest #1 (the owed verdicts)

This is the most important hour in the plan. Stage 3's pitch, drift, arena and first-climb verdicts are still unplayed by a human. Do this before any new work. Use headed Edge with the window focused, via `http://127.0.0.1:8123` or a double-click on `index.html`.

Play three runs:

1. **Naive run.** Read nothing. Pretend you are the reviewer.
2. **Deliberate run.** Use every mechanic.
3. **Break run.** Alt-tab while firing, spam pause, hug the arena wall, restart repeatedly, mute and unmute.

Fill `PLAYTEST-1.md`: one line per question, **PASS / TUNE / FAIL** plus one sentence.

- First 30 seconds: do I know what to do without being told?
- Launch, transition, combat: smooth? Any hitch?
- Pitch feel and drift weight: ever disoriented or lost?
- Can I always find enemies? Do I notice the arena edge coming?
- Charged shot: discovered without help? Does the stream still feel good?
- Pickups: can I tell the three apart at a glance?
- Boss: intro clear, weak point obvious, fight fair?
- Damage: can I tell what hit me?
- Death and win: clear, and one key to restart?
- Pacing: any boring stretch? Total length near 5 minutes?
- Frame rate: any stutter on first pickup, boss, big explosion?
- Sound: anything harsh, too loud, or missing?
- The three things that feel cheap or fake.

Every TUNE or FAIL becomes a BACKLOG line with a severity: **S1** blocks play, **S2** hurts feel, **S3** nice to have. Re-rank Phases 3 to 7 by what you actually felt. Your playtest overrides my ordering.

**Gate G2:** PLAYTEST-1.md committed.

## 8. Phase 3: Bugs and robustness

Every task here starts with step 1, VERIFY: reproduce the problem and show the red. A bug that cannot be reproduced is closed as 'not reproduced', never as 'fixed'.

- **B-01 Input stuck on blur.** Files: `src/input.js`, `tools/flow-check.mjs` (one new assert). On window blur, `visibilitychange` to hidden, and pointer release outside the window, clear `fire`, held keys and `mouseActive`. A hold released while away must not leave the charge running. Red: simulate blur with fire held, and `input.fire` is still true. Budget 30 lines.
- **B-02 Auto-pause when the tab is hidden**, and suspend audio. Read how pause works first; touch the smaller of `loop.js` or `phases.js`. Budget 40.
- **B-03 Seedable RNG.** New `src/rng.js` plus the gameplay rolls in `powerups.js` and `combat.js` only (not visual randomness). Default stays `Math.random` in play; `?seed=N` makes it deterministic. Flow-check rate asserts set a seed. Bounds are NOT changed. This is the one allowed harness change. Budget 60.
- **B-04 Edge discovery.** New `tools/edge-path.mjs`: env var `EDGE_PATH`, then known Program Files locations, then the highest version under EdgeCore. Clear error if none. Replace the hard-coded `156.0.4314.58` path everywhere. Budget 50.
- **B-05 Strip probes from the release build.** Files: `tools/build.mjs`, the probe import site, `package.json`. `npm run build` = release without probes; `npm run build:test` keeps them for flow-check. Red: release `index.html` still contains `chargeProbe`. Review by the second model is mandatory. If this destabilises the gate after two attempts, drop it and note in the README that probe URLs ship, documented. Budget 80.
- **B-06 No-GPU and context-lost fallback.** Friendly message instead of a black page; handle `webglcontextlost` and `webglcontextrestored`. Budget 60.
- **B-07 AudioContext resume** on first user gesture, guarded, with no console warning on cold load. File: `audio.js`.
- **B-08 Resize, DPR, small and large screens.** Verify camera aspect and composer resize on resize, and the HUD at 1366x768 and 4K. Fix only what is red.
- **B-09 Stale comments.** `boss.js` L35 (says 20 HP; shipped is 60) and the `main.js` rocketMetrics comment (expect `[0,-0.8]`). Comment-only, zero code change. This touches `boss.js` only for the comment, and only if story-019 has not started, because its zero-diff contract belongs to 019.
- **B-10 Pointer leaving the window mid-flight.** Verify that pitch and yaw input ease to zero rather than sticking. Check whether pointer lock is used. Fix only if red.
- **B-11 Storage blocked.** Verify the game boots with localStorage disabled. Check only; `store.js` should already guard it.
- **B-12 Tech debt.** TD-010 (tunnel texture dispose) only if cheap. TD-009 and the accepted advisories stay in the debt register with a README note.

**Gate G3:** all S1 bugs closed or logged, battery green, boot-marks green, tag the next letter in the chain.

## 9. Phase 4: Readability and onboarding

Highest feel gained per line of code. A first-time player in a full-3D shooter needs help finding things.

- **R-01 Reticle** at screen center, with the charge ring anchored to it. Files: `hud.js`, `tools/index.template.html`. Budget 40.
- **R-02 Off-screen enemy indicators.** Edge-of-screen arrows for the nearest 3 raiders, orbs or the boss when outside the view. Project world position to screen, clamp to an ellipse, flip for behind-camera. Pool 6 DOM elements, change-gated writes, zero per-frame allocation. Files: new `src/indicators.js` (takes a list through an api, reads no combat state), `hud.js`, template, one call site in `combat.js`. Machine check: a probe places an enemy behind the ship and the indicator appears at the expected angle; in view, it hides. Budget 150.
- **R-03 Arena-edge warning.** Past `R_SOFT - 6`, brighten the boundary shell, show a RETURN cue, and play a soft tick. Files: `arena-dressing.js`, `hud.js`, `combat.js`. Budget 50.
- **R-04 First-run control hints.** Title controls panel, plus contextual hints for steer and pitch, fire, boost, and a late 'HOLD to charge' hint shown after about 20 uncharged shots. 'Seen' flag stored via the guarded `store.js`. Budget 80.
- **R-05 Alternate fire key** for trackpad users. Check `input.js` for conflicts first; propose `KeyE`. Same code path as LMB, including charge. Budget 25.
- **R-06 Pickups distinct by shape, not color alone.** Different geometry per kind plus an icon on the HUD chip. Files: `powerups.js` (geometry factory), template. Budget 80.
- **R-07 Reduced motion and volume.** Honor `prefers-reduced-motion` (kick, shake, flashes scaled down). Master volume control. Persist both, which also closes most of story-020. Budget 80.
- **R-08 Pause menu.** Resume, restart, controls, mute, quality (quality hooks up in V-13). Read the existing pause first. Budget 100.
- **R-09 (optional) Damage-direction wedge** on the screen edge. Budget 60.

**Gate G4 + short playtest #2** (15 minutes): re-answer the Phase 2 questions for what changed.

## 10. Phase 5: Visual feel (all code, no Blender)

**Rules for every V task:**

- A kill-switch const at the top of its file (for example `VISUAL_X = true`).
- No per-frame allocation: pools and reused vectors.
- New pooled entities raise the restartProbe baseline deterministically; record the new baseline in the same build.
- Headed fps must not drop more than 10% (check the `?debug=1` overlay yourself). If it does, cut the effect. Never touch the DPR ladder.
- Human eyes decide PASS / TUNE / FAIL. The AI saves screenshots and states what to look at.

Ordered by return:

- **V-01 Procedural environment map.** PMREM from a small generated scene (gradient dome plus a few emissive panels), applied as `scene.environment`, with `envMapIntensity` tuned on ship, drone and boss materials. This is the biggest quality jump for GLBs, which look flat without it. Budget 80.
- **V-02 Nebula skybox.** Inverted sphere with a noise shader (3 octaves), 2 or 3 palette colors, slow drift, no depth write. Budget 120.
- **V-03 Star layers.** Two `Points` layers with parallax and shader twinkle. Budget 80.
- **V-04 Engine flame and trail.** Additive flame scaled by throttle and boost, plus a pooled trail (64). Budget 150.
- **V-05 Bolt look.** Elongated emissive core with glow, a comet tail on the charged bolt, and a pooled muzzle flash. Budget 100.
- **V-06 Hit feedback.** 50 to 70 ms hit-stop on kills (must not fight the death slow-mo), a hit-marker tick on the reticle, and pooled floating score pops (8). Budget 120.
- **V-07 Death effect.** Dissolve shader, instanced debris (pool 24), and a shockwave ring. Budget 150.
- **V-08 Shield bubble and low-hull feedback.** Fresnel flash on hit, red vignette and pulse tied to the existing alarm. Budget 80.
- **V-09 Post-lite.** One custom pass: vignette, subtle chromatic aberration scaled by speed, mild color grade. Must respect the bloom fallback and switch off at low quality. Budget 100.
- **V-10 Boost speed lines.** Budget 60.
- **V-11 Boss presentation.** Name card, health bar, a 1.2 s intro beat that leaves `timeScale` alone, weak-point pulse. HUD and `combat.js` only; `boss.js` is not touched. Budget 120.
- **V-12 Wave banner** with a sweep and change-gated updates. Budget 60.
- **V-13 Quality toggle** (Low / Med / High): bloom, post-lite, particle caps, DPR cap. Lives in the pause menu. Budget 80.

**Gate G5 + playtest #3.**

## 11. Phase 6: Audio feel (3 tasks, all in `audio.js`)

- **A-01** Hit-confirm tick, kill-confirm sound, and a distinct chime per pickup kind.
- **A-02** Music intensity that rises with wave number, a boss stem, and ducking under the low-hull alarm.
- **A-03** Mix: master, music and SFX buses, with a compressor or limiter so loud moments never clip.

The verdict is yours, by ear. Headphones and laptop speakers both.

## 12. Phase 7: Gameplay depth (trimmed story-019)

- **G-01 Boss reward 1000 flat (locked).** `SCORE_BOSS = 1000` in `combat.js`, awarded inside the `bossApi.report` wrapper's `bossDefeated` branch before the victory frame, with its own `C.bossAwarded` latch. `boss.js` is ZERO-DIFF. Red: the victory probe reads score without +1000 on the pre-change build.
- **G-02 Elites (optional).** Build only if playtest #2 says waves feel samey. Locked spec: wave 4 and up, chance 0.22 per raider spawn, raiders only, HP x3, speed x1.15, scale x1.35, score x2, tint `0xffa02f`, unconditional reset in `spawnRaider`. Add a readable tell (halo plus an audio sting).
- **G-03 Wave tables for waves 1 to 5 (optional).** Totals equal the derived formula exactly. Only if the difficulty curve is a playtest complaint.
- **G-04 Difficulty tuning from playtest notes.** ONE knob per commit (`T_CHARGE`, `DROP_CHANCE`, `waveSpeed`, damage values), with before and after recorded. Any assert that pins a knob is updated by the card, never silently.
- **CUT: the 12-group telemetry.** It has no player-visible value and no reviewer will see it. This was your locked decision, so it is your call. If you keep it, do it last and smaller.
- **CUT (already out of scope):** combos, leaderboard, touch controls.
- **Story-020 settings persistence** is satisfied by R-07 and V-13. Mark it done there.

## 13. Phase 8: Vi3W assets

The interview task is about models generated in app.vi3w.in, so the README should clearly show product use. You generate in the app; the AI integrates.

- **Wish list, in priority order:** gunner raider, rammer raider, 2 asteroids, 3 pickup crystals (or keep the procedural shapes), boss variant.
- **Spec to give the app:** stylized low-poly, single mesh, 15k triangles or fewer, simple textures, GLB export, about 2 m long, forward = +Z (confirm against the drone pipeline), origin centered.
- **Size budget:** each GLB 400 KB or less, final `index.html` 6 MB or less. Reduce triangles in the app rather than adding a decoder.
- **Pipeline:** reuse the story-012 build-time swap with a procedural fallback so a bad GLB never crashes the game.
- **M-01** Generalize the loader (one card). **M-02 onward:** one asset per card. Each must verify: loads, a probe prints the bounding box and forward axis, and a corrupt-GLB fallback assert (like `?corruptGlb`).
- **Eyes:** scale and orientation look right.
- **README credits table:** asset, source (Vi3W-generated, own, or named CC0 pack), license. If Vi3W generation is unavailable, Kenney or Quaternius CC0 packs are fine, credited.

## 14. Phase 9: Ship prep

- **S-01 Release verification.** Check size, zero console errors or warnings on cold load, and run a copy of `index.html` from a different folder by double-click. Browsers: Edge, Chrome, Firefox. Screens: 1366x768, 1920x1080, 4K or high DPI. One full run on a trackpad.
- **S-02 README** (a reviewer reads it in 60 seconds): one-line pitch, video or GIF, Play link, controls table, what to notice in a 5-minute tour, how it was built (Three.js r187, single file, ZCode and GLM, honest about AI assistance and the verification regime), module map from the handoff, build and test commands, credits and licenses, an honest known-limitations list, and what you would do next. About 150 lines. Files: `README.md` and `docs/` only.
- **S-03 Recording (you).** About 45 seconds of the full flow with Windows Game Bar (Win+Alt+R). Keep it under 10 MB in the repo, or use an unlisted video link.
- **S-04 Hosting.** GitHub Pages serving the single file. Check repo size with `git count-objects -vH`: a 4 MB generated `index.html` committed many times bloats history. Decide whether to keep committing it.
- **S-05 Git identity and history (TD-007, you, with the backup).** Commits carry a provisional noreply identity and must be fixed before the repo is public. Two options: (A) rewrite authors in place with a history tool after backup, then re-point every tag; (B) publish a fresh repo from a snapshot with a `docs/process-history.md` summarizing stages and tags. Prefer B if the repo is large or you are unsure, since it carries less risk. The AI may write the exact commands for you to review, but never runs history rewrites. Verify afterwards: `git log --format='%an %ae' | sort -u` shows only your intended identity, and tags resolve.
- **S-06 .gitignore and litter (TD-08).** Ignore `build/`, `.edge-profile-*` and scratch. On your explicit go-ahead, delete ONLY `build/.edge-profile-*` dirs, after the AI lists exactly what it will delete.
- **S-07 License and hygiene.** MIT for code, assets per the credits table. Search for secrets and personal paths before going public.
- **S-08 Submission note** to the company: what it is, how to run it, what to look at, an honest statement of AI assistance.

## 15. Phase 10: Final gate and freeze

- **F-01** Full battery on master, headed boot-marks, cold-machine run, and a 5-minute playtest by someone else. Say nothing and watch where they get stuck. That is the most valuable data you will get.
- **F-02** Tag `release-1.0` and record the SHA in the ledger.
- **F-03** Freeze. After this only S1 showstoppers are allowed, each through the same task-card protocol.
- **F-04** Back up the release folder and a copy of `index.html` outside the repo.

## 16. Ledger format

```
LEDGER — STAGE TWO
CURRENT: <ID> — <status>
PLAN: A or B (decided <date>)
| ID | Title | Branch | Status | Tag |
Status values: todo / doing / red / green / review / merged / cut
```

The AI updates only its own row.

## 17. Time plans and cut line

**Plan A (about 1 day):** P0, P1, P2, then B-01, B-06, B-07 (B-05 optional), then R-01, R-02, R-05, R-06, then V-01, V-04, V-06, then G-01, then S-01, S-02, S-04 to S-08, then Phase 10.

**Plan B (about 3 days):** Day 1: P0 to P3. Day 2: P4, V-01 to V-08, playtests #2 and #3. Day 3: Phases 6 to 8 selectively, then P9 and P10.

**Cut line:** when behind, cut from the bottom of Phases 5 to 8. Never cut Phases 1, 2, the S1 bugs in 3, or Phases 9 and 10.

## 18. Definition of done

- Master tagged `release-1.0`, battery green, boot-marks under 1000 ms.
- Zero console errors or warnings on a cold load from `file://`.
- Playtest by a stranger: they can fire, steer and find enemies without help within 30 seconds.
- No S1 items open in BACKLOG.md.
- README, credits table and recording exist. Git identity is clean.
- Every claim in the README about the game is something you personally saw.

## 19. Working with GLM 5.3 Flash

- Keep cards under one screen, and ask for one file per step where possible.
- Paste only the rules block and the card. Never the whole handoff.
- Make it restate the card in two lines. If the restatement is wrong, restart the session.
- Windows paths: always quote them, and use the Edit or Write tools instead of sed or perl (CRLF breaks multiline patterns).
- The builder never grades itself. Use the second model for review.
- If it loops or invents paths, stop the session and restart with a fresh context.
