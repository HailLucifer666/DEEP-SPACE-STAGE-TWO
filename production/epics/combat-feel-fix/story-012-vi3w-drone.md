# Story 012: Vi3W drone — third enemy type, GLB-swap-ready

> **Epic**: combat-feel-fix (Stage 2 — boss + victory)
> **Status**: Complete (machine gates green 2026-11-04; merged per FULL AUTO grant)
> **Layer**: Logic/Visual
> **Type**: Logic
> **Estimate**: M
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-04

## Context

The take-home's signature enemy. Two halves per the approved roadmap:

1. **Procedural silhouette** — ring + core + fins, matching the raiders' additive neon look
   (the `glowMat` sprite pattern in `makeRaider`, src/enemies.js:41). Distinct shape at a
   glance: raiders are ship-shaped, the drone is NOT.
2. **Movement in FULL 3D VECTORS from day one** — raiders live on the XZ plane
   (`dy` never enters their steering); the drone must vary `y` as a first-class component so
   Stage 3 (full 3D flight, story-015/016) retunes it instead of rewriting it.
3. **Swap-ready BUILD-TIME condition** in `tools/build.mjs`: if `build/drone.glb` exists,
   inline it and use it; else procedural. A file:// page cannot probe sibling files at
   runtime (why the GLBs are base64-inlined) — so the swap MUST be a build decision, and a
   probe proves BOTH paths.

**Approved by the user** in the Stage 2–5 roadmap (2026-11-04).

## Design (tuning knobs live here)

- Behavior: **orbiting diver**. Holds a tilted 3D orbit ring around the player (each drone
  gets its own orbit-plane tilt, radius 12–20 u, y ∈ ARENA_Y ± 6), then periodically dives
  through the player's position along its orbit tangent (telegraph: glow flare + audio tick
  ~0.6 s before the dive). Dive damage on contact like a rammer (25). HP 2, score 200.
- Spawning: joins waves from wave 3; count = `min(3, wave − 2)`; the rest of the wave stays
  raiders (the pure formula in enemies.js is untouched — per-wave tables are story-019).
- Naming: the new module is `src/drone.js`, entity kind `'orb'`. The pre-existing raider
  names `hitDrone`/`droneRadius` in enemies.js are historical — do NOT rename them (churn
  without behavior); note the collision in the report.

## Acceptance Criteria

- [ ] `src/drone.js` (new): procedural mesh (ring + core + fins + additive glow), own pool
      via `makePool`, full-3D steering (position.y is part of every velocity computation —
      no `ARENA_Y` constant baked into its movement code), telegraphed dive, `clear()` drain.
- [ ] Wave integration in `src/combat.js` (+`src/enemies.js` only if the spawn path needs
      it): drones join from wave 3, rule above; `combatState()` gains `drones` (live count)
      and `boss: null`-ready shape for story-013.
- [ ] Probe `?droneProbe=1`: spawns one drone deterministically 12 u ahead of the ship,
      reports `droneProbe: { yRange, path3d, telegraph }` on `window.__stage2` — yRange > 1 u
      over a ~3 s window proves the 3D movement.
- [ ] Build-time swap: `tools/build.mjs` inlines `build/drone.glb` when present (same
      weld/dedup/prune/quantize pipeline, new template token `window.__DRONE_B64`); the page
      picks GLB when the token is non-empty, procedural otherwise. A `droneBuild` field in
      the probe surface reads `'glb' | 'proc'`.
- [ ] **Both paths probed and recorded**: default build (no GLB) → `droneBuild: 'proc'`;
      then a throwaway valid GLB staged at `build/drone.glb` (a small node script may
      synthesize one — no new npm deps) → rebuild → `droneBuild: 'glb'` + the mesh visibly
      swaps; then the GLB is removed and the default build restored as the shipped state.
- [ ] kee red-before-green: the new flow-check asserts fail on master (recorded red with the
      reason), pass on the branch; adjacent keep-passing cases (raider counts unchanged,
      wave 1–2 has zero drones) shipped; mutation record in the test file.
- [ ] flow-check 28/28 + new asserts green; full probe set green (`goto=combat`,
      `restartProbe=1` clean — pool drains prove `clearCombat` covers drones).
- [ ] Retained screenshot `production/qa/evidence/story-012-drone/s12-drone.png` (the
      procedural drone in frame) + programmer report at
      `production/qa/evidence/story-012-drone/programmer-report.md`.

## Out of Scope

- Vi3W model itself (the player will export `drone.glb` later — the swap path is the
  deliverable here, not the asset).
- Per-wave composition tables (story-019), boss (story-013), victory (story-014).

---

## Files (pre-authorized)

- `src/drone.js` (new), `src/combat.js`, `src/enemies.js` (spawn path only if needed)
- `tools/build.mjs`, `tools/index.template.html` (the `__DRONE_B64` token only)
- `tools/flow-check.mjs` (new asserts), `tools/drone-glb-probe.mjs` (throwaway path-prover,
  may live under tools/ and be committed — it is the both-paths evidence)
- `production/qa/evidence/story-012-drone/` (report + screenshot + stamp)

---

## Test Evidence

**Status**: [x] Created — both-path probe outputs, red-before-green record, screenshot.
`production/qa/evidence/story-012-drone/programmer-report.md` (2026-11-04): flow-check
29/8 RED on master → 37/37 GREEN on branch (×2, incl. the final shipped build); both build
paths proved by `tools/drone-glb-probe.mjs` (`droneBuild 'glb'/1 mesh part` vs `'proc'/5`);
mutations spawn-rule + y-amp recorded; restartProbe=3 clean:true; full probe set green.

---

## Dependencies

- Depends on: story-011 (clean modules), Stage 1 probes.
- Unlocks: story-013 (boss reuses the drone's 3D steering patterns), Stage 3 tuning.
