# Story 008 — bloom post-processing: Programmer Report

**Status: COMPLETE** — 2026-11-04, branch `story-008-bloom`.

## Files changed

- `src/main.js` — the whole story: composer wiring in `boot()`, both loop render sites routed
  through the post chain, `onResize`/`setDpr` composer sync, `dprTick` bloom rungs, `tickTitle`
  re-framing, debug overlay post line, `__stage2.post` probe. (44-line diff, no other logic touched.)
- `src/lib-entry.js` — **no change needed**: EffectComposer / RenderPass / UnrealBloomPass /
  OutputPass were already re-exported (verified before editing). `src/main.js` now imports them.
- `index.html` — modified by `npm run build` (committed bundle artifact regenerated), not a hand edit.
- API signatures were verified against the pinned `three@0.187.0` in node_modules before use
  (`UnrealBloomPass(resolution, strength, radius, threshold)`; `EffectComposer.setSize/setPixelRatio`).

## Render path — before / after

- **Before**: two call sites in `loop()` called `renderer.render(scene, camera)` directly — the
  paused frozen-frame branch and the main-path end. The post chain classes were imported and dead.
- **After**: `boot()` creates an `EffectComposer` once (`RenderPass` → `UnrealBloomPass` →
  `OutputPass`) inside a try/catch; both call sites now run
  `composer ? composer.render() : renderer.render(scene, camera)`. On any composer throw the catch
  nulls `composer`/`bloomPass`, logs one `console.error('[stage2] post chain disabled … reason:')`
  and the game stays on direct `renderer.render` — the never-crash contract. `onResize` calls
  `composer.setSize` next to `renderer.setSize` (the anticipating comment was replaced by the
  implementation); `setDpr` additionally runs `composer.setPixelRatio(v)` + `composer.setSize`.
  The DPR ladder toggles only `bloomPass.enabled` — the composer path itself is never touched.
- Start tuning (the deliverable, not gold-plated): threshold 0.85, strength 0.6, radius 0.4.

## dprTick ladder (story-008 rungs)

- Degrade (`lowT >= 2` at <45 fps): `bloomPass.enabled = false` first; a later trigger steps DPR
  down. At the DPR floor bloom still drops ("before it drops DPR further").
- Recovery (`highT >= 10` at ≥50 fps): `bloomPass.enabled = true` first; a later trigger steps DPR
  up. **See deviation 1** — the story text and the dispatch brief order this rung oppositely.
- Headless note: the probe `__stage2.post` reports the wired chain ('bloom'), not the runtime
  toggle, per the brief's definition ('off' = composer construction failed). In headless software
  WebGL (~36-45 fps) the ladder legitimately toggles the pass off after ~2 s; on real hardware at
  60 fps it never triggers.

## Title framing (tickTitle only, no scene changes)

- Radius 6.8 → **5.6** (bottom of the approved 5.6-6.0 range, ship reads largest), orbit height
  1.15 → **2.25** (sway ±0.3 kept), lookAt (0, 0.3, 0) → **(0, 1.35, 0)** — the camera now looks
  above the ship so it sinks to the lower third and clears the title/button stack; orbit phase,
  speed, sway and the ship roll are unchanged. Iterated three times and picked the values with the
  largest, best-lit presentation (top deck under the key light). The hull remains a dark metal —
  pre-existing material look (visible in the story-007 evidence too), not touched per "no scene
  changes"; the player's verdict gates it.

## Verification (all run by me)

- **Build**: `[build] index.html  mode=bundle  4.34 MB  (274 ms)` — success (brief expected ~4.32 MB;
  the small growth is the now-alive post-chain code, previously tree-shaken).
- **Title SHOT**: `production/qa/evidence/story-008-bloom/s8-title-framing.png` — ship below the
  title text and button stack, lower third. STATE with it: phase title, `post bloom`, `CONSOLE []`.
- **Combat SHOT**: `production/qa/evidence/story-008-bloom/s8-combat-bloom.png` — LIVE combat frame
  (hull 100, shield 50, wave 1, 4 enemies, one visible top-center) captured ≤2 s into combat so the
  headless fps ladder had not toggled the pass yet; star halos show bloom active. See deviation 2
  for why the prescribed 30 s wait produces a gameover frame instead.
- **STATE dump** (default URL, no SHOT): `phase title`, debug overlay ends `audio locked · post
  bloom`, `CONSOLE []`. `__stage2.post` returned `"bloom"` (asserted verbatim in the resize probe).
- **Resize probe (AC 2)** — throwaway CDP script in the OS temp dir (repo tools/ untouched):
  viewport 900x620 then 1400x760 @1.5 dpr — canvas buffer tracked exactly (900x620 → 1400x760),
  then a 10-event rapid resize storm — no exceptions, `post` stayed `"bloom"`, `CONSOLE []`, no
  stretch. Retained: `production/qa/evidence/story-008-bloom/s8-resize-1400x760.png`.
- **Regression gate (pre-verified for the orchestrator)**: `node tools/flow-check.mjs` →
  `FLOW-CHECK PASS — 28 passed, 0 failed`, `CONSOLE []`.
- No test file written (waived at qa.level: minimal); flow-check + flow-check 28/28 + retained
  screenshots are the acceptance evidence. tools/* and the other fenced files untouched.

## Deviations

1. **Recovery-ladder ordering conflict between story and brief.** Story: bloom "restores it last".
   Brief: "re-enable it before stepping DPR up". Both satisfy the AC ("≥50 fps for 10 s restores
   it"; observed behavior deferred to playtest). I implemented the brief's literal ordering (it is
   the direct dispatch instruction, and it validates bloom at the cheap buffer before climbing
   DPR). Flipping to the story's LIFO reading is a one-line branch swap in `dprTick` if QA/design
   prefers it — flagged here rather than silently chosen.
2. **Combat evidence timing.** The prescribed 30 s capture yields a gameover frame: headless Edge
   (`--disable-gpu`, software WebGL) runs combat at ~36-45 fps and the unpiloted ship dies ~1-2 s
   after combat entry. I kept the prescribed command but moved the wait to 6.5 s to land inside the
   live window. `bootMs()` is evaluated at dump time, not boot completion — worth knowing for
   future probe timing.
3. **Extra retained evidence**: `s8-resize-1400x760.png` (resize AC) beyond the two required shots.
4. The story file's uncommitted working-tree edits (title-framing AC added) are the orchestrator's,
   not mine — I only read it.

COMPLETE.
