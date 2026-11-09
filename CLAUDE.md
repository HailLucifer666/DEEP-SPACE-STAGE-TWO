# STAGE TWO — project instructions (CCGS studio installed 2026-11-03)

> **LAUNCH PROTOCOL:** read `one-shot-work/LAUNCH-10-10.md` before any task. One writer at a time; see its §1 rules and §8 session protocol.

Browser space-combat micro-game (vanilla three.js, single-file build) for the VI3W
interview take-home. The Claude-Code-Game-Studios framework lives in `.claude/`
(74 skills, 49 agents, docs/templates) with `project.yaml` as its config
(`modes.rigor: minimal`, `modes.automation: guided`).

## Studio skills

Slash-commands live in `.claude/skills/<name>/SKILL.md`. Most useful here:
`/smoke-check`, `/playtest-report`, `/bug-triage`, `/create-stories` → `/dev-story`,
`/design-review`, `/code-review`, `/scope-check`, `/retrospective`, `/changelog`.
If a skill is not registered in the host's skill list, read its SKILL.md directly and
follow it — the file IS the skill.

## Hard rules that outrank the studio process (kept from the pre-studio workflow)

1. `index.html` is BUILD OUTPUT — never hand-edit it. Only `npm run build` (esbuild
   bundle of `src/` + `tools/index.template.html`, GLBs base64-inlined by `tools/build.mjs`).
2. One task at a time. 3-bullet plan + "what could break" before code. Smallest diff
   that works (~150 lines; contained rewrites allowed when the plan says so).
3. Smoke test after every task:
   `node tools/cdp-check.mjs "file:///E:/Game%20Build/index.html?debug=1&goto=combat" 62000`
   expecting `phase: combat`, `rocket: glb`, `CONSOLE []` (waits ≥62 s — headless boot
   decodes two GLBs, ~55-60 s).
4. Never claim a visual result — the human is the eyes; screenshots land in `build/shots/`.
5. Never say done without showing the real command output. Seen-red before trusting a check.
6. Rollback = `git checkout <last good-tag>`. Tag chain lives in `one-shot-work/PROGRESS.md`.
7. `git reset --hard`, force-push and destructive rm are denied in `.claude/settings.json`.

## Architecture map (read before touching code)

- `src/main.js` — boot, loop, phase machine (`setPhase` runs the NEW phase's exit hook —
  exit-before-enter; overlays hide via the entering phase), input, DPR auto-degrade.
- `src/launch.js` — deep-space cruise: ship rig, streaming field (rocks/wrecks/planet/
  black hole), plume, drift/chase cams. THE SHIP NEVER LEAVES THE LANE AT THE ORIGIN.
- `src/transition.js` — rift (screen-space shader quads) → warp tunnel → logo → combat.
- `src/combat.js` — player steering/fire/bolts, arena clamp, chase cam with velocity trail,
  edge pips, death slow-mo.
- `src/enemies.js` — raiders (gunners hold range + fire; rammers dive), derived wave math.
- `src/effects.js`, `src/pool.js`, `src/audio.js`, `src/assets.js` — pools/effects/synth/fonts.
- Probes: `?debug=1&goto=launch|transition|combat`, `?ascent=N`, `?holdCount=1`,
  `?holdBeat=1..4`, `?skipProbe=N`, `?scriptedKill=1`, `?restartProbe=N`, `?spin=1`,
  `?corruptGlb=1`. Harness: `tools/cdp-check.mjs`, click-throughs in
  `tools/death-card-check.mjs`.

## Knowledge graph — query it FIRST (token saver)

A graphify knowledge graph of this repo lives in `graphify-out/` (built 2026-11-09, 765
nodes / 1470 edges): `graph.json` (queryable), `GRAPH_REPORT.md` (god nodes, surprising
connections, suggested questions), `graph.html` (interactive viz). Before reading many
files to answer an architecture/relationship question, query the graph instead —
`.venv/Scripts/graphify query "<question>"` (or `.venv/Scripts/python -m graphify ...`),
`.venv/Scripts/graphify path A B`, `.venv/Scripts/graphify explain "Concept"`.
Incremental refresh after code changes: `npm run build`-independent —
`.venv/Scripts/graphify update` (needs the venv; AST cache is gitignored, outputs are
committed). Corpus scope: `src/ tools/ design/ docs/ production/polish/` + root specs.
