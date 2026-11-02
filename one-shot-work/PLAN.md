# PLAN

Vertical, screenshot-provable slices (handoff §9), LEAN rigor.

## Slice 1: SPIKE — generator + skeleton + strategy verdict
- Goal: generator (`tools/build.mjs`) + template → self-contained `index.html` with inlined three + bundled addons + inlined GLB parsed to owner's rocket; TITLE screen, LOADING overlay, debug overlay, no-WebGL overlay, dt-clamped rAF, `window.__stage2`. Spike: import strategy over file://.
- Files touched: `stage-two/tools/build.mjs`, `stage-two/tools/index.template.html`, `stage-two/src/main.js` (+ small modules), `stage-two/index.html` (generated), `stage-two/build/` (intermediates), package.json, one-shot-work files.
- Acceptance test: browser screenshot shows owner's rocket; console clean (read via tooling); `?corruptGlb=1` → primitive fallback + logged reason; spike verdict + three version pasted in STACK.md.
- Risk: data-URL/import-map over file:// could fail → blob-URL fallback; UMD last resort (verify addon availability first); addon shader-module graph needs esbuild (scoped justified dev-dep).

## Slice 2: LAUNCH — pad, countdown, ignition, ascent
- Goal: pad island + gantry + swing arm, dawn lighting, cinematic pad cam, countdown HUD + beeps, ignition thrust cone + sparks/smoke/rumble/shake, ascent gravity turn + lagged chase cam + clouds + sky gradient + stars + telemetry, max-Q shake.
- Files touched: `src/launch.js`, `src/audio.js`, `src/world.js` (procedural), template CSS/HUD.
- Acceptance test: screenshots T-3, ignition, high-altitude starfield; tab-freeze probe (§8.1); console clean.
- Risk: particle-overdraw perf → cap counts, pool sprites; sky gradient banding → dithered canvas gradient.

## Slice 3: TRANSITION — 4 beats + skip
- Goal: B1 ring punch (torus, flash, plume cut/vacuum, re-light blue), B2 HUD lock-in assembly, B3 warp tunnel shader + streaks, B4 slow burn "COMBAT ONLINE"; any-key skip → clean COMBAT entry; double-skip guard.
- Files touched: `src/transition.js`, `src/hud.js` (assembly), `src/main.js` (phase hooks, skip()).
- Acceptance test: screenshot per beat; skip at every beat lands COMBAT (counts sane); double-skip no-op; console clean.
- Risk: skip-mid-beat timers/loops linger on → central clear() on phase enter; audio vacuum crossing → explicit loop stop.

## Slice 4: COMBAT CORE — chase cam, fire, drone, waves, HP, gameover
- Goal: steering (mouse + keys), hold-fire pooled lasers, Drone ram AI, derived wave spawner, collisions, HP+shield regen, hit feedback (kick, vignette, flashes), timing slowdown, GAMEOVER + both restart paths, restart-x5 baseline cleanliness.
- Files touched: `src/combat.js`, `src/pool.js`, `src/enemies.js`, `src/effects.js`, template HUD.
- Acceptance test: scripted kill probe; restart ×5 → counters at baseline; scores truthful (§8.9); console clean.
- Risk: arena-space/bank math edge cases → clamp + NaN guards upfront; spawn bombs during restart.

## Slice 5: COMBAT BREADTH — gunner, burster, elite, powerups, combo
- Goal: Gunner bolts (dodgeable), Burster split, Elite variants (wave ≥ 4), 3 powerups (SPREAD/OVERDRIVE/SHIELD + 8 s timers), combo x1–x8 + HUD, guarded high score persist.
- Files touched: `src/enemies.js`, `src/powerups.js`, `src/hud.js`, `src/state.js` (score).
- Acceptance test: screenshots each enemy type + combo text; high score survives reload; console clean.
- Risk: split-child spawns on restart leak → pooled + reset-drained; persisted high score corrupting → schema guard.

## Slice 6: POLISH + GATE
- Goal: pause suspends audio, mute, resize recompute, FPS auto-degrade (DPR first, then bloom), README (run, controls, architecture, ponytail ledger, interview notes, screenshots), gate.md run → `GATE.md`, kee-style adversarial read-only reviewer pass, ≤12-line final report.
- Files touched: template + src polish, `stage-two/README.md`, `GATE.md`, one-shot-work updates.
- Acceptance test: every gate.md item ticked with evidence; every reviewer finding fixed or answered; documented run path (file:/// double-click) executed once; console clean.
- Risk: gate finds perf/latency regressions in psych transitions → fix within slice budget, BLOCKERS.md if 3× retry fails.
