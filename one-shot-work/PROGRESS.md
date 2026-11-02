STATE 2026-11-03 02:16 | task: T1 | last good tag: good-s4 | build: ok | next: SHIP1 | blockers: provisional git email (real GitHub noreply pending)

# PROGRESS

Skill: one-shot | Rigor: LEAN | Output type: game | Gate: not run
Current slice: S4 COMBAT CORE
Self-review findings (S2): none blocking. Tracked for S5/S6: gantry tower reads as a "monolith" in close orbit frames (consider widening orbit or moving tower); rocket/title center overlap (layout spacing); hints-line contrast #66798a (measure ratio; darken if <4.5:1).
S3 findings: none blocking. Transition beats distinct and skip-guard proven (combatEntries exactly 1 after double-skip at two different beats). Note: headless Edge renders slow (fps 9-17 under tunnel) — CDP probes need long waits; real GPU is fine.

S2 verdicts worth keeping:
- browser.wait text-conditions are unreliable on this game's HUD (tele/debug/count) — evaluate-poll or snapshot instead.
- virtual-time-budget headless runs are consumed by the GLB decode (~real time), so phase walks never start — headless only good for static frames (title/veil/corrupt); phase shots need the live tab.
- Live tab runs at 144 fps ONLY while the OpenCode browser desktop window is the foreground window; document.hasFocus()=false ⟹ rAF frozen + screenshots refused. Probe cadence must account for it (and ask the user to keep it foreground when visuals are due).
- Back-to-back evaluate polling starves the rAF loop (game slows down); let the page run between tool turns for natural-time transitions.

| Slice | Status (todo, doing, done) | Tests passing | Notes |
| --- | --- | --- | --- |
| S1 SPIKE | done | yes | both import strategies pass over file:// (headless Edge 156 + live tab); BUNDLE shipments on (2.77MB); corrupt probe → fallback+reason; buttons wired; tex bound (probe); console 0 errors |
| S2 LAUNCH | done | yes | pad→countdown→ignition→ascent→hold live shots ✓; numeral renders (HUD-unhide defect found+fixed: enterPad re-hid hud after main un-hid it); plume pivot-weld fix; trail path-spread; camLight fill; §8.1 freeze probe 0.024 drift/6s; audio unlock via real click audioLive:true; §8.2 corrupt→fallback+reason; starfield+sky burn-off+hold tele freeze (THR 64, VEL coast); particles live-count probe; console 0 errors |
| S3 TRANSITION | done | yes | B1 ring punch (torus+flash+plume cut/vacuum+blue re-light) B2 HUD lock-in (reticle+tele stagger) B3 warp tunnel (tube shader+streaks) B4 slow-burn COMBAT ONLINE; any-key skip at any beat → COMBAT (state guard), double-skip no-op (combatEntries=1 after 2 attempts at beats 1 and 3); auto-transition after 3.2s post-burnout coast; central clear() disposes beat objects on combat entry (entities 11→14→11); console 0 errors via CDP on all probes; shots in build/shots/s3-b*.png |
| S4 COMBAT CORE | todo | | |
| S5 COMBAT BREADTH | todo | | |
| S6 POLISH + GATE | todo | | may only start after S1–S5 done |
