# SPEC

Source: approved handoff plan `C:\Users\acarg\.opencode\plan\stage-two-plan.md` (2026-11-02). Plans §4 locked decisions are requirements, not proposals — not re-asking (per handoff §0.5).

## Problem
Interview take-home micro-game for the browser that impresses via polish, reliability and written craft notes: one continuous experience — cinematic rocket launch from a pad → stylized 4-beat transition into deep space → chase-cam space shooter. Owner's GLB rocket is the hero asset in both phases.

## Users
- Interview reviewers (primary): play ~5 min, read code + README.
- Owner: reviews before submission.

## In scope
- Self-contained `E:\Game Build\index.html` (double-click from file://, zero internet) + `README.md` beside it.
- Phases: LOADING, TITLE (high score + control hints, `[ LAUNCH ]` / `[ SKIP TO COMBAT ]`), PAD, COUNTDOWN, IGNITION, ASCENT, TRANSITION (4 beats: ring punch → through-the-glass / 2D HUD assembly → warp tunnel → slow burn "COMBAT ONLINE"), COMBAT, GAMEOVER.
- COMBAT chase-cam: mouse steers (banks toward cursor, lerped, NO pointer lock), hold LMB/Space fire, Shift boost (meter), WASD/arrows full alternative, P/Esc pause, M mute. Escalating endless waves, bounded invisible arena ("RETURNING TO SECTOR" on soft clamp).
- Enemies: Drone (kamikaze ram), Gunner (holds distance, dodgeable red bolts), Burster (HP sponge, splits into 2 faster rocks), Elite variants wave ≥ 4 (scaled/retinted/+HP; replaces boss per ledger).
- Powerups ~15–20% drop, 8 s life: SPREAD / OVERDRIVE / SHIELD. Combo x1–x8 (resets 2.5 s). HP + regenerating shield (~3 s). Death slow-mo (~0.3 timeScale) → GAMEOVER card: score, high score, "REPLAY LAUNCH" / "SKIP TO COMBAT".
- Audio 100% synthesized (WebAudio, ~12 recipes, unlock on first gesture, master mute). Procedural canvas sprite textures. UnrealBloom post. Pooled particles (~2k cap in combat).
- Guards/probes (handoff §8.1–8.10), `?debug=1` overlay, `window.__stage2` counters, DPR cap 2, resize-safe, FPS auto-degrade (drop DPR first, then bloom).

## Out of scope (ponytail ledger — do not expand)
- Boss with weak points (Elite replaces), 3D cockpit interior (2D HUD assembly over vignette), thruster nose puffs, hull-chip particles, floating score jewels.
- Multiplayer, mobile/touch, networking, any dev-server requirement.
- Git init per slice (only if owner asks — handoff §2).

## Acceptance criteria (each checkable yes/no)
1. Double-clicking `E:\Game Build\index.html` (file://) runs the full game with zero internet and console clean — console READ via browser tooling each slice, never assumed.
2. Owner's GLB rocket renders with normals computed + auto-centered/scaled (screenshot proves); nose orientation verified visually in S1 and corrected once if wrong.
3. `?corruptGlb=1` → primitive-rocket fallback renders + exact decode reason logged; normal load (negative control) shows the real rocket.
4. Launch path: 3-2-1 countdown numerals + beeps; gantry arm swings clear mid-count; ignition = flickering engine cone + sparks + billowing side-spill smoke + rumble + proximity-scaled shake; ascent = gravity turn, lagged-spring chase cam, cloud billboards, sky gradient dawn→black, stars fade in, ALT/VEL/THR jittered telemetry, max-Q shake peak.
5. Backgrounding the tab ~5 s then resuming: no position/altitude/camera jump (dt clamp ≤ 0.05 s + skip first frame).
6. Transition beats B1–B4 are distinct and visible; any-key skip at EACH beat lands valid COMBAT; double-skip cannot double-enter (state guard).
7. COMBAT controls per in-scope lines all work; pause suspends audio; mute silences gradually/no crash.
8. Enemy behaviors per spec (Drone/Gunner/Burster/Elite); arena soft-clamp + warning text.
9. Powerups behave per spec incl. drop rate/lifetime; combo timing per spec; shield regen 3 s; death slow-mo + GAMEOVER card with both restart paths.
10. Die → restart via "SKIP TO COMBAT" ×5: entity + particle counters return to baseline each time (debug overlay).
11. `?debug=1` overlay shows fps/phase/entity/particle counts; `window.__stage2` exposes probe counters.
12. High score persists across reload; storage guarded (try/catch + in-memory fallback).
13. Resize mid-play: renderer + composer + bloom recomputed, no stretching.
14. No-WebGL env → friendly overlay explaining GPU-accelerated browser need.
15. Fresh load with NO gesture: console clean; audio unlocks only on first gesture.
16. HUD renders honest values only (never NaN/undefined; zero-length mouse deltas safe).
17. `index.html` embeds Three.js and GLB (no runtime fetch of local files); ~2.5–3 MB accepted.
18. Waves derived from wave number (no hand-written per-wave lists).
19. FPS auto-degrade drops renderer DPR first, then bloom quality; triggers before framerate death spiral.
20. `README.md` exists with run instructions, controls, architecture map, design decisions + ponytail ledger, interview notes, screenshots.
21. `one-shot-work\` files consistent with what was built; `GATE.md` recorded; final report ≤ 12 lines with files that exist on disk.

## Constraints
- Windows; deliverable root = `E:\Game Build` (owner directive 2026-11-02: "build the game here in this folder only" — game files sit directly in this folder); scratch at `F:\C Drive Packages Dump\relocated\tmp\opencode`.
- GLB source: `C:\Users\acarg\Downloads\output.glb` (measured facts in handoff §3 are the build-time truth: 1 mesh, 8,268 verts, POSITION+TEXCOORD_0, NO normals, baseColorTexture only, ~1 unit tall Y-up).
- Build toolchain: Node v24.18.0 available (`node --version` → v24.18.0); Python 3.14.2 present but not needed.
- Inline strategy settled by Slice-1 spike (§5 premise): import map + data-URL, blob fallback, UMD last — or the simpler same-ladder alternative if the spike proves it; verdict + evidence recorded in STACK.md.

## Output type and deploy target
Game — one self-contained HTML file opened locally by double-click (no server, no internet). Executors: modern desktop Chrome/Edge/IE-free browsers.
