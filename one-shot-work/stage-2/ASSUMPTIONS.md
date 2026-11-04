# ASSUMPTIONS — Stage 2

- **Merge grant (player decision, 2026-11-04): FULL AUTO, no verdict gates.** Stories merge
  and tag on machine gates alone (build + flow-check + story probes + evidence on disk).
  Player look/feel review happens at stage close (screenshots + report), revocable at any
  tag via `git checkout <good-tag>`. This overrides the roadmap's per-story
  AskUserQuestion verdict gate.
- Stories 011–014 written per the CCGS template copied from story-007..010 structure.
- Story-012 swap path is BUILD-TIME only (`build/drone.glb` existence check in
  tools/build.mjs) — a file:// page cannot probe sibling files at runtime.
- Boss appears after wave N with N=5 (plan default; tuning knob, review r2).
- No `drone.glb` exists yet → procedural path is the shipped default.
