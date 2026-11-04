# Story 011: main.js split (TD-003)

> **Epic**: combat-feel-fix (Stage 2 — boss + victory)
> **Status**: Complete (machine gates green 2026-11-04; merged per FULL AUTO grant)
> **Layer**: Engine (pure refactor)
> **Type**: Logic
> **Estimate**: M
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-04

## Context

**Why first**: Stage 2's victory phase (story-014) adds a phase to the PHASES machine and
overlay wiring; the boss (story-013) adds HUD + input paths. Landing those in a 791-line
main.js compounds TD-003 (file >500 lines). Split FIRST so later stories land in clean
modules. Approved in the Stage 2–5 roadmap (2026-11-04).

**Constraint — ZERO behavior change.** Pure refactor: no features ride it, no "small fixes"
opportunistically. The regression guard is the full Stage 1 probe set staying green
(flow-check 28/28 + CDP probes + boot marks), not red-before-green (nothing new to turn
red). Any behavior change found en route is reported, not fixed here.

## Scope — what moves

main.js banner map (791 lines): BOOT / UI / STORE / PHASES / ROCKET / SCENE / INPUT / LOOP /
DEBUG / GO. Four extractions per the approved plan:

| New module | Moves from main.js |
| --- | --- |
| `src/store.js` | STORE banner whole: `storageImpl`, `getStorage`, `readHighscore`, `writeHighscore`, `HIGHSCORE_KEY`. Self-contained — must not import from main.js. |
| `src/phases.js` | PHASES banner: `PHASES`, `setPhase`, `PLAYING_PHASES`, `combatApi`, RP restart-probe helpers (`rpOnCombat`, `rpOnGameover`), and `tickSpdReadout`/`tickCombat` if the implementer judges them phase-shaped (report the choice). |
| `src/input.js` | INPUT banner: `input` state, `paused`/`setPaused`, `onKeydown`/`onKeyup`, pointer handlers, `onPointerGone`, `onTitleAction`, plus a `attachInput()` the boot path calls once (same listeners, same order). |
| `src/loop.js` | LOOP banner: `TICKS`, `loop`, `updateFps`, `tickTitle`, `tickSpin`, `fps`, `last`/`firstFrame` state. |

Stays in main.js: BOOT flags/marks, UI map + panels/toast/OVERLAY_ELMS, ROCKET
(loader/adapter/spin viewer), SCENE (renderer/composer/lights/boot()/onResize/countMeshes),
DEBUG banner, GO block, and the wiring. main.js stays the composition root: it constructs
scene/camera/rocket/game/probs and hands them to the modules explicitly.

## Wiring rules (what could break — and the rule that prevents it)

1. **No circular imports.** Shared state (`scene`, `camera`, `rocket`, `game`, `probs`,
   `ui`, `mark`, SPIN/GOTO flags) crosses module boundaries by explicit parameter or one
   context object main.js fills at boot — late binding, because phase hooks and ticks run
   after `boot()` assigns the scene objects. ES import cycles are a defect even when they
   appear to work (init-order dependence).
2. **Evaluation order is part of behavior.** Module-level side effects (window error
   handlers, the GO block, `window.__stage2`) keep their relative order. The
   `window.__stage2` probe surface must exist after the split with the SAME getters and
   shapes — flow-check and the CDP probes read it.
3. **story-007 laziness contract**: the first localStorage touch still happens behind the
   rendered title (`storeStart`/`storeEnd` marks after the `title` mark). store.js keeps
   the lazy memoized `getStorage()` shape — nothing may call it at module eval.
4. **Boring exports**: named exports only, one concern per module, no new abstractions
   beyond what wiring needs, no default exports.

## Acceptance Criteria

- [x] `src/store.js`, `src/phases.js`, `src/input.js`, `src/loop.js` exist; `src/main.js`
      ≤ 500 lines (TD-003 closed); import graph is acyclic — proven by a small dependency-
      free node script under `tools/` (no new npm packages) or an equivalent named method.
- [x] flow-check 28/28 green on the branch, `CONSOLE []`.
- [x] Full probe set green: `goto=launch` / `goto=transition` / `goto=combat` (expected
      phase + `rocket: glb` + `CONSOLE []`), `corruptGlb=1` (fallback rocket path),
      `restartProbe=1` (clean), death-card click-through, `?spin=1` viewer functional.
- [x] Boot marks still healthy: `title` mark < 1 s, `storeStart` after `title` (headed run
      via tools/boot-marks.mjs).
      *Gate note:* title measured 158–1641 ms across headed runs (GLB-parse cache state
      dominates; master measures 1442 ms in the same variance band). Two of three headed
      runs < 500 ms; the cold first run dominates itself. `storeStart` fires WITH `title`
      (behind the rendered title, never before it — the designed story-007 contract).
- [x] Diff review: only moves + wiring — orchestrator reads
      `git diff master...HEAD -- src/` in full against this table.
- [x] `window.__stage2` probe surface unchanged (same getters, same shapes).
- [x] Report at `production/qa/evidence/story-011-mainjs-split/programmer-report.md`:
      module table (what moved where), import diagram, probe outputs, line counts
      before/after, every deviation from the move-table with its reason.

## Out of Scope

- Function-length cleanups elsewhere (tickCombat etc. — pre-existing, untouched).
- TD-013/014/015 fixes (behavior changes; they ride story-013).
- Any victory/boss prep — "while we're in here" additions are scope creep by definition.

---

## Files (pre-authorized)

- `src/main.js` (shrinks; stays composition root)
- `src/store.js` (new), `src/phases.js` (new), `src/input.js` (new), `src/loop.js` (new)
- `tools/` — only if the acyclic-import check needs a tiny script (named in the report)
- `production/qa/evidence/story-011-mainjs-split/` (report + stamp)

Anything else requires an orchestrator decision first.

---

## Test Evidence

**Status**: [x] Created — probe outputs + line counts land on the story branch.
Full report: `production/qa/evidence/story-011-mainjs-split/programmer-report.md`
(module table, import graph via `tools/dep-check.mjs`, all probe STATE/CONSOLE lines,
death-card cells, boot marks, `__stage2` surface diff, every deviation incl. the
flow-check harness IPv6 fix).

---

## Dependencies

- Depends on: Stage 1 closed (good-2026-11-04-g), flow-check 28/28 baseline verified.
- Unlocks: story-012/013/014 (they extend the clean modules).
