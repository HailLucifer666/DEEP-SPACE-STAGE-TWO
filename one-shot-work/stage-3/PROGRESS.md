Skill: one-shot | Rigor: LEAN | Output type: game | Gate: not run

# PROGRESS — Stage 3 (full 3D flight, stories 015–017)

Plan of record: `design/gdd/full-3d-flight.md` (design source — §6 per-story file lists,
§7 tuning knobs, §8 acceptance criteria) + `docs/architecture.md` (module map, risk register
R1-R8, harness strategy, §5 must-not-break). Numbered criteria: `one-shot-work/stage-3/SPEC.md`.
Baseline verified 2026-11-05: master bd79b79, tag good-2026-11-05-c, flow-check 76/76,
EPIC 001–014 Complete, stage-2 GATE PASS.
Merge grant: GRANTED 2026-11-05 — the Stage-2 pattern (machine-gate merges with look/feel
review at stage close; ASSUMPTIONS.md item d resolved).
Planned assert growth: 76 → 98 (015) → 103 (016, +8 new/re-derived − 3 band retirement)
→ 111 (017). Two pre-declared flagged-semantics changes live in the 016 step (probes
7/7b/8 re-derived r → r3; the 015 band asserts retired) — never quiet edits.

- [x] Setup: story-015..017 files + EPIC.md rows (013/014 stale Pending → Complete; 015/016/
      017 appended) + stage-3 SPEC/PLAN/PROGRESS/ASSUMPTIONS (branch stage-3-setup,
      commit 0d76523; TD architecture doc + GD GDD written first, all grounded in code)
- [ ] Slice 1: story-015 — pitch + drift (keystone forward() 3D, ±72° envelope, ALIGN_RATE 4.5,
      chase-cam unpin; rides: raider altitude-follow + three XZ-only collision scans → 3D,
      temporary altitude band scaffold, controls text ×2)
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
