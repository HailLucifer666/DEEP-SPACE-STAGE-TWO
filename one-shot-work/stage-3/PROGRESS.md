Skill: one-shot | Rigor: LEAN | Output type: game | Gate: not run

# PROGRESS — Stage 3 (full 3D flight, stories 015–017)

Plan of record: `design/gdd/full-3d-flight.md` (design source — §6 per-story file lists,
§7 tuning knobs, §8 acceptance criteria) + `docs/architecture.md` (module map, risk register
R1-R8, harness strategy, §5 must-not-break). Numbered criteria: `one-shot-work/stage-3/SPEC.md`.
Baseline verified 2026-11-05: master bd79b79, tag good-2026-11-05-c, flow-check 76/76,
EPIC 001–014 Complete, stage-2 GATE PASS.
Merge grant: GRANTED 2026-11-05 — the Stage-2 pattern (machine-gate merges with look/feel
review at stage close; ASSUMPTIONS.md item d resolved).
Assert growth: 76 → 99 ACTUAL (015 — plan said 98; +1 camera guard from the quality review).
Remaining estimate: → ~104 (016, +8 new/re-derived − 3 band retirement) → ~112 (017). Two
pre-declared flagged-semantics changes live in the 016 step (probes 7/7b/8 re-derived r → r3;
the 015 band asserts retired) — never quiet edits.

- [x] Setup: story-015..017 files + EPIC.md rows (013/014 stale Pending → Complete; 015/016/
      017 appended) + stage-3 SPEC/PLAN/PROGRESS/ASSUMPTIONS (branch stage-3-setup,
      commit 0d76523; TD architecture doc + GD GDD written first, all grounded in code)
- [x] Slice 1: story-015 — pitch + drift (keystone forward() 3D, ±72° envelope, ALIGN_RATE 4.5,
      chase-cam unpin; rides: raider altitude-follow + three XZ-only collision scans → 3D,
      temporary altitude band scaffold, controls text ×2)
      Orchestrator verification 2026-11-05: implementer DONE_WITH_CONCERNS → concern resolved
      by designer adjudication. Spec review ✅ (independent: scope hygiene — forbidden files
      zero-diff; S15-1..13 walked against code; harness diff pure-addition; red record real).
      Quality review CONCERNS (3 IMPORTANT: ppDone never reset; velMag assert stale denominator
      — steady 0.898 below the 0.9 floor; R1 camera change with zero machine coverage) → fix
      pass 578777c (8 findings applied; camera assert two-sided, mutation-proven — the
      prescribed ≥10° floor alone could NOT fail the re-pin mutation) → re-review APPROVE.
      GDD §4.3 ERRATA (designer-adjudicated, 60a304f): sustained-turn radius TIGHTENS under
      drift (|vel| = speed·cos β, β = atan(ω/k) ≈ 26°) to ≈6.94 u vs the GDD's predicted
      growth to 9-11; AC re-set [6.5, 7.3]; flat build 7.73 fails it (drift-sensitive).
      Gates re-run by orchestrator: build 4.37 MB; dep-check PASS (main.js 500/500);
      flow-check 99/99 `CONSOLE []`; boot-marks headed MODULE→TITLE 571 ms (< 1000);
      restartProbe=3 clean:true (entities 31 ×3 identical). Mutations 7/7 verified red
      (5 story + ram-xz + camup two-sided).
      Evidence: production/qa/evidence/story-015-pitch-drift/ (report.md incl. §9 fix pass,
      flow-red + 3 green records, 7 mutation outputs, 2 screenshots).
      Commits: e1ec750 (feat) · ba8e82e (evidence) · 60a304f (GDD errata) · 578777c (fix pass).

      Stage-3 rider backlog (story-015 review chain — non-blocking; land with 016 unless named):
      R-a camera assert down-side ceiling `cu.down ≤ 35` · R-b 0.4 s pitch-window assert →
      rate-consistency form · R-c main.js PANEL_HTML data-driven rows refactor — MANDATORY
      before the next story adds a main.js line (500/500, zero headroom) · R-d transient
      lookAt basis twist → ship-relative quaternion camera frame (cosmetic) · R-e probes
      extraction → src/probes.js (probes ≈43% of combat.js) · R-f raider vertical separation
      dy · R-g pose world-space nose sign assert (optional) · R-h report §7.1 formula-typo
      fix + review-fix numbering reconciliation note · R-i camera-assert bounds are calibrated
      to current look-target offset + camera-lag constants — any retune re-adjudicates.
- [ ] Slice 2: story-016 — spherical arena (R_SOFT 60 / R_HARD 80 sphere at O; rides: band
      scaffold deleted with flagged retirement, boss dashTarget shell clamp — one line)
- [ ] Slice 3: story-017 — world goes 3D (ambient field ~120 instanced + shell visual,
      rim-ring lifecycle; zero src/launch.js changes)
- [ ] Stage close: independent review + smoke record + changelog + GATE.md (this folder);
      S3X experiential gate + backdrop screenshot + open tuning items collected here
      (013/014 full-auto grant convention)

Method per story (carried from stage-2, evolved):
story file → ONE gameplay-programmer subagent (report path under
`production/qa/evidence/<story-slug>/`) → spec-compliance review (against SPEC.md's numbered
criteria + the GDD) → code-quality review (kee discipline) → orchestrator re-runs gates
(build + dep-check + flow-check + the story's probes, verify claims on disk) → merge --no-ff
→ flow-check on merged master → tag `good-YYYY-MM-DD-<letter>`.
Player look/feel review at stage close per the merge grant (once decided — ASSUMPTIONS d).

Notes:
- kee inside every story: red-before-green probes (record on the PRIOR build — 015 reds on
  master bd79b79, 016 reds on the 015 close build, 017 reds on the 016 close build),
  mutation + date recorded IN the test file, verify the mutation actually applied (read the
  red output before recording), adjacent keep-passing cases ship alongside, never merge past
  red, never alter the harness semantics (M10: the only sanctioned changes are 016's two
  pre-declared flagged re-derivations).
- Tag chain: one letter suffix per merged story, date prefix changes on a new calendar day
  (stage-2 convention: good-2026-11-04-j → good-2026-11-05). `main` is always known-good;
  rollback = `git checkout <tag>`.
- Evidence receipts per story: programmer report + flow-red/mutation outputs + screenshot
  under `production/qa/evidence/story-015-pitch-drift/`,
  `story-016-spherical-arena/`, `story-017-world-3d/`.
- Probes landing this stage: `?pitchProbe=1` (015), `?dressingProbe=1` (017); 016 reuses the
  existing boundary walk + `?bossProbe=1` page. All report on `window.__stage2` with
  `lastReport` parity; each new harness page asserts its own `CONSOLE []` (stage-2 review
  finding-2 pattern).
- Stage-2 verdicts PAID 2026-11-05 (drone look / boss feel / victory moment — all PASS,
  recorded in stage-2 PROGRESS.md). Stage-3 look/feel review lands at stage close per the
  grant, alongside the S3X experiential gate.
