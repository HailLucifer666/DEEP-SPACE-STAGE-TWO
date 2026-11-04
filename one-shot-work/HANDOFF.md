# HANDOFF — STAGE TWO (written 2026-11-03)

Complete handoff for any AI (or human) picking this up cold. Part 1 = project + state + bug ledger. Part 2 = session-by-session plan for what's left. Verify claims against disk; this file describes reality as of the date above.

---

# PART 1 — WHAT THIS IS, WHAT'S DONE, WHERE WE ARE

## 1.1 The project in one paragraph

**STAGE TWO** is an interview take-home browser micro-game: one continuous experience — cinematic rocket launch from a pad → stylized 4-beat transition into deep space → chase-cam space shooter. The owner's own GLB rocket model is the hero asset in both phases. The entire game ships as **ONE self-contained HTML file** (`E:\Game Build\index.html`, ~2.81 MB) that runs by double-click from `file://` with zero internet — Three.js, the GLB (base64), and all game code are inlined at build time. Reviewers play ~5 minutes and read the code + README (README is an S6 deliverable, not yet written).

## 1.2 Hard constraints (do not violate)

- **Deliverable root is `E:\Game Build`** (owner directive: "build the game here in this folder only"). Note the space in the path — always quote it.
- **`index.html` is GENERATED, never hand-edited.** `npm run build` runs `node tools/build.mjs`, which splices the esbuild bundle + base64 GLB into `tools/index.template.html` and writes `index.html`. It errors on unresolved `{{TOKENS}}`.
- **No dev server, no internet at runtime, no git** (git init is out of scope per SPEC unless the owner asks). No global installs; all deps live in the project's `node_modules` (three 0.187.0 pinned, esbuild 0.28.2 dev-only; Node v24.18.0).
- Windows + Git Bash. Headless Edge at `C:\Program Files (x86)\Microsoft\EdgeCore\156.0.4314.58\msedge.exe`.
- Workflow skill: **one-shot, LEAN rigor**. State files in `one-shot-work/` (SPEC.md, PLAN.md, STACK.md, PROGRESS.md, ASSUMPTIONS.md). Read PROGRESS.md's first line first after any context reset.
- The operator (Arghya) wants: every behavior change shipped with a probe that has been **seen to fail** (kee prime rule), plain-language explanations, decisions flagged loudly, and what a fix does NOT cover stated explicitly.

## 1.3 Architecture & file map

```
E:\Game Build\
├── index.html                  # THE deliverable (generated, 2.81 MB, bundle mode)
├── package.json                # name "stage-two"; scripts.build
├── src\
│   ├── main.js                 # boot, phase machine, loop (timeScale/pause), input, probes, __stage2
│   ├── launch.js               # pad world + COUNTDOWN/IGNITION/ASCENT + audio recipes + ambience()/plumeSet()
│   ├── transition.js           # TRANSITION: 4 beats + skip guard + clearTransition()
│   ├── combat.js               # COMBAT: player pose/steer/fire, HP/shield, waves, death, probes
│   ├── enemies.js              # Drone AI + DERIVED wave math (waveCount/waveSpeed/waveStagger/waveWobble)
│   ├── effects.js              # explosion sprite pool, hit veil (DOM), camera kick
│   ├── pool.js                 # reuse-first object pool (spawn/kill/update/clear)
│   ├── audio.js                # WebAudio synth: beep/sweep/noiseBurst/loopStart/loopsStopAll/vacuumDrop/
│   │                           #   audioSuspend/audioResume/setMuted — nothing throws on missing context
│   └── lib-entry.js            # re-exports three + GLTFLoader as 'stage-two-lib'
├── tools\
│   ├── build.mjs               # generator (bundle mode; importmap fallback exists but unused)
│   ├── index.template.html     # HTML/CSS/HUD template with {{GLB_B64}} {{MODE}} {{APP_JS}} {{IMPORTMAP}}
│   ├── cdp-check.mjs           # CDP verify harness: state dump + console capture (+ SHOT=env → PNG)
│   └── combat-probe.mjs        # interactive CDP probe: real key/mouse events, 6 verdicts
├── build\
│   ├── output.glb              # owner's rocket (1.5 MB, inlined at build)
│   ├── inspect-artifact.mjs    # data-URL inspector
│   └── shots\*.png             # s3-b1..b4, s3-combat, title (screenshots for the OWNER; AI can't see them)
└── one-shot-work\              # SPEC / PLAN / STACK / PROGRESS / ASSUMPTIONS / HANDOFF(this file)
```

**Phase machine** (`src/main.js`) — everything hangs off this:

```js
const PHASES = {
  loading:  { enter() { ... } },
  title:    { enter() { ... } },                       // high score + [ LAUNCH ] / [ SKIP TO COMBAT ]
  pad:      { enter() { ... LAUNCH.enterPad(); ... } },
  countdown:{ enter() { LAUNCH.enterCountdown(); } },  // 3-2-1 numerals + beeps, gantry arm swings
  ignition: { enter() { LAUNCH.enterIgnition(); } },   // plume + sparks + smoke + rumble + shake
  ascent:   { enter() { LAUNCH.enterAscent(); } },     // gravity turn, chase cam, sky burn-off, telemetry
  transition:{ enter() { TRANSITION.enterTransition(scene, camera, rocket, ui, {
                go: (n) => setPhase(n),
                report: (r) => { probs.sub = r; window.__stage2.lastReport = r; },
              }); } },
  combat:   { enter() { ... COMBAT.enterCombat(scene, camera, rocket, ui, combatApi()); ... },
              exit()  { COMBAT.clearCombat(); } },     // exit hook = central teardown (no leaks)
  gameover: { enter() { game.timeScale = 1; writeHighscore(...); show card; },
              exit()  { hide card; } },
};
function setPhase(name) {
  const hook = PHASES[name];
  if (!hook) { console.error(`[stage2] unknown phase "${name}" — refused`); return false; }
  if (hook.exit) hook.exit();   // ← exit hooks run BEFORE the next enter: the anti-leak contract
  probs.phase = name;
  hook.enter?.();
  return true;
}
```

**Loop** with slow-mo + pause (dt clamp is the background-tab guard, spec acceptance #5):

```js
function loop(ts) {
  window.requestAnimationFrame(loop);
  if (firstFrame) { last = ts; firstFrame = false; return; }   // §8.1 first-frame skip
  let dt = (ts - last) / 1000; last = ts;
  if (!Number.isFinite(dt) || dt <= 0) dt = 0;                 // §8.9 NaN hygiene
  if (dt > DT_CLAMP) dt = DT_CLAMP;                            // DT_CLAMP = 0.05
  if (paused) { last = ts; renderer.render(scene, camera); return; }
  const sdt = dt * game.timeScale;                             // death slow-mo = 0.3
  game.time += sdt;
  TICKS[probs.phase]?.(sdt, game.time);
  updateFps(ts); updateDebug(dt, ts);
  renderer.render(scene, camera);
}
```

**Pool** (`src/pool.js`) — the reuse-first fix that made restarts baseline-clean:

```js
spawn() {
  // reuse-first: a dead item comes back before any new allocation, so restart
  // cycles allocate nothing once the pool is warm. idx only matters at saturation.
  let it = items.find((x) => !x.userData.alive);
  if (!it) {
    if (items.length >= n) it = items[idx++ % n];   // steal oldest slot
    else { it = make(); it.visible = false; it.userData.alive = false;
           scene.add(it); items.push(it); }
  }
  it.visible = true; it.userData.alive = true; live++;
  return it;
}
```

**Derived waves** (`src/enemies.js`) — acceptance #18: no hand-written per-wave lists:

```js
export const waveCount   = (w) => Math.min(24, 3 + Math.floor(w * 1.5));
export const waveSpeed   = (w) => Math.min(12, 6.5 + w * 0.45);
export const waveStagger = (w) => Math.max(0.25, 1.1 - w * 0.08);
export const waveWobble  = (w) => 1.2 + w * 0.06;
```

**Combat pose group** — the rocket is re-parented so yaw/pitch/roll compose cleanly:

```js
C.pose = new THREE.Group();
C.pose.rotation.order = 'YXZ';       // yaw (heading) → fixed pitch → roll (bank)
C.tilt = new THREE.Group();
C.tilt.rotation.x = Math.PI / 2;     // +Y nose → +Z forward
C.pose.add(C.tilt);
// enterCombat: C.tilt.add(rocket)  |  clearCombat: reparent back to scene root + reset
```

**Probe surface** (`window.__stage2`): `version, mode, phase, fps, rocket, hasTexture(), camPos(), rocketY(), audioLive(), entities, particles, highscore, combatState(), time, paused, muted, bootMs(), lastReport, skipProbe, restartProbe, combatEntries`.

**URL probes** (all read `URLSearchParams` in main.js / launch.js / combat.js):
`?debug=1` (overlay) · `?corruptGlb=1` (fallback rocket + reason) · `?goto=launch|transition|combat` (auto-walk) · `?ascent=N` (1–60, compress climb) · `?holdCount=1` (freeze countdown) · `?holdBeat=1..4` (freeze a transition beat) · `?skipProbe=1|3` (double-skip guard check) · `?scriptedKill=1` (bolt kills seeded drone) · `?restartProbe=N` (die→restart ×N, baseline check).

## 1.4 Done so far (S1–S4, all probe-verified)

| Slice | Status | What landed |
|---|---|---|
| S1 SPIKE | done | Generator + template; import-strategy verdict: **bundle mode** (2.77 MB then) beats importmap over file://; GLB inlined + corrupt-probe fallback; TITLE/LOADING/debug overlay; `__stage2` |
| S2 LAUNCH | done | Pad island/gantry/swing arm, dawn lighting, countdown numerals+beeps, ignition (plume/sparks/smoke/rumble/shake), ascent gravity turn + lagged spring chase cam + clouds + sky burn-off + stars + jittered telemetry, max-Q shake, dt-clamp background-tab guard, audio unlock on first gesture |
| S3 TRANSITION | done | B1 ring punch (torus + white flash + plume cut/vacuum + blue re-light), B2 HUD lock-in (reticle + telemetry CSS assembly), B3 warp tunnel (tube texture + 160 streaks), B4 slow-burn "COMBAT ONLINE"; any-key skip at every beat with double-skip guard; post-burnout 3.2 s coast auto-enters transition; central `clearTransition()` teardown |
| S4 COMBAT CORE | **built + probe-verified; closeout pending** | Chase-cam combat: mouse steer (NDC→plane unproject, banks toward cursor, no pointer lock) + WASD/arrows; soft-clamped arena (±26) + "RETURNING TO SECTOR"; hold-fire pooled bolts (~8/s, LMB or Space); Shift boost meter; shield 50 → hull 100, shield regen after 3 s clean; Drone ram AI + derived waves; explosions/hit veil/camera kick; death slow-mo (timeScale 0.3, 1.2 s) → GAMEOVER card with REPLAY LAUNCH / SKIP TO COMBAT; pause (P/Esc, suspends audio clock) + mute (M); restart-proven pool cleanliness |

**Where we are right now:** `index.html` is the S4 build (`S4 v0.3.0`, bundle, 2.81 MB). The game was verified **live** in ZCode's in-app browser at `http://127.0.0.1:8123/index.html` (a Python `http.server` on port 8123 bound to `E:\Game Build` already exists — reuse it; if down: `python -m http.server 8123 --bind 127.0.0.1 --directory "E:\Game Build"`). The in-app browser cannot open `file://` — that's why the server is needed for live viewing.

**S4 verification evidence (all console-clean via CDP):**
- `?goto=combat` → full natural loop ran headless: drones spawned/seeked/rammed, wave 1 cleared, death slow-mo, gameover card, honest score.
- `?scriptedKill=1` → `lastReport.scriptedKill = {score:100, kills:1, enemiesAlive:4, particles:12, boltsLive:1}`.
- `?restartProbe=5` → `{"runs":5,"clean":true}`, all entries `{hp:100, shield:50, score:0, wave:1, particles:0, bolts:0, entities:13}`.
- `tools/combat-probe.mjs` → PASS pause-freeze, pause-audio, resume, mute, holdfire, honest (no NaN/undefined in HUD text).
- Boot regression: title, `rocket:glb+tex`, console `[]`.

**NOT yet done for S4** (do these first in the next session):
1. S1–S3 regression re-run was **interrupted** (boot + holdBeat 2–4 + skipProbe 1/3 + natural path). Must be green before S4 is "done".
2. Four-quadrant self-review (senior engineer / QA / security / designer with **measured** contrast ratios for the new HUD text).
3. S4 screenshots for the owner (`SHOT=E:/Game Build/build/shots/s4-*.png`).
4. PROGRESS.md: S4 row → done + evidence; "Current slice" → S5.

## 1.5 Bug & environment-quirk ledger (the part that saves the next AI days)

**Real code bugs found and fixed (all caught by probes, all probes now red→green proven):**

1. **`rocket is not defined` in `tickTransition`** (S3) — transition.js referenced the main.js module-scope variable. Threw every frame; loop froze before the debug overlay rendered, so the page looked "stuck in title". **Fix:** use the `T.rocket` state object. **Lesson:** the CDP console capture is what caught it — silent screenshots would have passed it.
2. **Scripted-kill bolt flew backwards** (S4) — `b.userData.dir.copy(C.tmp).negate()` pointed the probe bolt *away* from the seeded drone; probe read `kills:0, score:150`, no kill report. **Fix:** dir = `+forward`. Red→green recorded in the probe's comment (2026-11-02).
3. **Pool round-robin allocation leak** (S4) — `items[idx++ % n]` consumed a NEW slot every spawn, so each restart created fresh meshes: entities grew +2/run, `restartProbe` returned `clean:false` (caught red). **Fix:** reuse-first free-list (`items.find(x => !x.userData.alive)`, idx only at saturation). Rerun: `clean:true`, entities constant 13. This is the exact defect class acceptance #10 exists for.
4. **`startWave` seed never fired** (S4) — `E.spawnT = 0.01` + `spawnTick(0)` can't cross the `<= 0` gate; the "seed one immediately" comment was wrong (kee class 10: confident comment, wrong code). **Fix:** direct `spawnDrone()` + `queued--`.
5. **Debug overlay stuck on `combat/B4`** (S3 cosmetic) — `probs.sub` (last beat report) wasn't cleared on combat entry. **Fix:** `probs.sub = null` in combat enter.
6. **CDP edit mangling** (process, S4) — a hand edit split a JSON template in cdp-check.mjs; caught by reading the file, repaired in full. **Lesson:** after any edit to the harness, read the block back before running.

**Harness/environment traps (not code bugs — they WILL bite again if forgotten):**

7. **Edge's sync dialog hijacks target selection** — the first CDP page target can be `edge://sync-confirmation-dialog`, not your game. Always match targets by **exact URL**.
8. **Headless GLB decode blocks the main thread for seconds** — a `setTimeout(..., 200)` probe timer fires late; evaluating "too early" shows `phase:"title"` and looks like a broken goto. **Fix:** waits of 25 s+ and phase polling, never fixed short sleeps. `--virtual-time-budget` is consumed by the decode — phase walks never start under it (S2 finding, still true).
9. **Orphaned headless Edge processes** — `child.kill()` leaves the browser tree alive (26 orphans were found once); stale processes re-serve stale state and lock profile dirs. **Fix:** `taskkill /F /T /PID` in cleanup + unique `--user-data-dir` + random debug port per run. Nuke strays: PowerShell `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'"` filtered by `CommandLine -like '*edge-profile*'`.
10. **Headless fps is 9–17 under load** (tunnel/combat) — game-time lags wall-clock because of the dt clamp; probes need proportionally longer waits.
11. **`--dump-dom` is empty on this Edge build**; `--screenshot` works but **the AI models in this pipeline cannot see images** — the verification gate is DOM/probe state via CDP `Runtime.evaluate`; PNGs are owner-facing artifacts only.
12. **A Python http.server already occupies 127.0.0.1:8123** serving `E:\Game Build` — don't fight it; reuse or pick another port. (An `EADDRINUSE` crash from trying to rebind is expected if you don't check first.)
13. **Interactive probe hangs**: dispatch real input via CDP `Input.dispatchKeyEvent`/`dispatchMouseEvent` (trusted gestures — they unlock audio); give fetch calls `AbortSignal.timeout` and the script a 90 s watchdog so it can never hang silently (that was added after two silent hangs).
14. **S2 notes that still hold**: live-tab rAF freezes when the OpenCode browser window is unfocused (`document.hasFocus()=false`) — keep it foreground for live visual checks; back-to-back evaluate polling starves the rAF loop — let the page run between tool turns.
  15. **flow-check fixed-port trap (story-011, 2026-11-04)**: flow-check spawned Edge on a FIXED debug port (9941) while a failed run can leave its whole Edge tree alive (taskkill /T can miss parts); the NEXT run's `/json/list` then answers from the STALE tree — the harness attaches to an already-walked page whose phase is past `title`, and the title poll times out (`FAIL poll timeout` / `0 passed, 0 failed`). Repairs landed in `tools/flow-check.mjs` 2026-11-04 (page target matched by URL PREFIX; profile `rmSync` in cleanup). RULES: (a) after ANY failing flow-check run, `taskkill` lingering `*edge-profile*` msedge trees and verify `netstat :<port>` is free BEFORE re-running; (b) build NEW harnesses with RANDOM ports (cdp-check style), never fixed ones.

## 1.6 How to verify anything (the harness)

```bash
cd "E:/Game Build"
npm run build                                      # regenerate index.html (never hand-edit it)
node tools/cdp-check.mjs "file:///E:/Game%20Build/index.html?debug=1" 25000
#   → prints "STATE {json}" + "CONSOLE [errors]" ; grep the phase/combat/probe fields
SHOT="E:/Game Build/build/shots/x.png" node tools/cdp-check.mjs "<url>" 25000   # + PNG
node tools/combat-probe.mjs                        # interactive: pause/mute/fire/honest verdicts
```

The gate is always: **phase/state assertions + `CONSOLE []` (zero errors/warnings/exceptions)**. A green screenshot is not evidence; a probe that has never been seen red is not evidence either.

---

# PART 2 — PLAN FOR THE NEXT SESSIONS

## Session 1 — Close out S4 (no new gameplay, ~1 short session)

1. **Regression suite** (acceptance-first rule: earlier tests must stay green):
   - boot (`?debug=1` → phase title, `rocket:glb+tex`, `CONSOLE []`);
   - `?goto=transition&holdBeat=1..4` → `phase transition/B1..B4` + B2 `hudAssemble:true` + B4 `combatOnlineHidden:false`;
   - `?goto=transition&holdBeat=1&skipProbe=1` and `...=3&skipProbe=3` → `combatEntries === 1`, `doubleEnterGuard:true`;
   - natural path `?goto=launch&ascent=3` with ~50 s wait → passes ascent → transition (B4) → combat; console clean throughout.
2. **S4 screenshots** for the owner: `s4-combat.png` (idle), one firing (CDP mouse-down during capture), `s4-gameover.png`.
3. **Four-quadrant self-review**, in writing, fix every finding:
   - Senior engineer: dead code, file sizes (all < 800 lines), function sizes (< 50), no `THREE_POOL`-style leftovers.
   - QA: empty-wave edge (wave clear while paused), spam-fire pool saturation, pause during death slow-mo, resize mid-combat, gameover→replay→combat race (double-click on both buttons), warn element stuck visible.
   - Security: no untrusted input paths (localStorage already guarded; no network); NaN guards on all HUD writes.
   - Designer: **measure** contrast of `#hud-bars`/`#hud-score` (#bfe9ff on rgba(4,8,12,.6) ≈ 14:1 — pass), `#go-score` (#ffd88f on rgba(5,9,14,.72) — compute), `#warn`; fix anything < 4.5:1.
4. **PROGRESS.md**: S4 → done with the evidence line (include the two red→green mutation proofs: pool leak, bolt direction); "Current slice: S5".

## Session 2–3 — S5 COMBAT BREADTH (the next build slice)

Goal per PLAN.md: Gunner, Burster, Elite variants (wave ≥ 4), 3 powerups, combo x1–x8, guarded high-score persistence. Files: `src/enemies.js`, `src/powerups.js` (new), `src/hud` bits in `tools/index.template.html`, score logic in `src/combat.js` (+ small `src/state.js` if score logic grows).

1. **Write probes first** (kee): each enemy type state probe, combo-timing probe, high-score persistence probe (write → reload → read), Burster split-leak probe (kill burster → `restartProbe` still clean), powerup drop-rate sanity probe. Every one must be seen red before trusted — plant a defect once if it passes first try.
2. **Gunner** (enemies.js): holds distance ~14 from player, strafes (perpendicular sine), fires a **dodgeable red bolt** every ~1.8 s (speed ~18, own pool `GunnerBoltPool`, reuse `makePool`), bolt × player circle test → `damagePlayer(10)`; gunner HP 2.
3. **Burster** (enemies.js): HP 4 sponge, slow (×0.6 speed); on death spawns 2 **split children** (scale 0.6, ×1.5 speed, HP 1, no further split) — spawn through the same pool (reuse-first already guarantees no restart leak; `clearEnemies()` drains both).
4. **Elite variants** (enemies.js): for `w >= 4`, each spawn has derived elite chance (e.g. `eliteChance = (w >= 4) ? 0.22 : 0`), elite = scale ×1.35, retint emissive to `0xffa02f`, HP ×3, speed ×1.15, score ×2. Derived from wave number — no hand-written lists (acceptance #18).
5. **Powerups** (`src/powerups.js`): on kill, `Math.random() < 0.18` → drop one of SPREAD/OVERDRIVE/SHIELD (rotating pickup sprite, 8 s ground life, blink last 2 s, pickup radius 1.4). Effects last 8 s: SPREAD = 3-bolt fan (±6°), OVERDRIVE = fire interval ÷ 2.2, SHIELD = +full shield + zero regen delay for the window. HUD chips show active effect + seconds left. Timer state lives in combat.js player object; `clearCombat()` wipes it.
6. **Combo** (combat.js): `combo` 1–8, `comboTimer` 2.5 s refreshed per kill; score gain = base × combo; HUD pop animation on increment; reset when the timer expires (NOT on taking damage — spec only defines the 2.5 s reset). Cap ×8.
7. **High score**: already persisted via `readHighscore`/`writeHighscore` (main.js, guarded storage) at gameover; add title-screen display (exists) + gameover "NEW HIGH SCORE" state. Acceptance #12 probe: write → reload page → read.
8. **Regression + build + PROGRESS.md** after each mechanic; screenshots of each enemy type + combo text for the owner.

## Session 4 — S6 POLISH + GATE (final)

1. **UnrealBloom post chain — NOTE: still missing.** SPEC lists UnrealBloom in scope; the S4 onResize comment defers "composer + bloom resize land with the post chain". Session 4 must add the `EffectComposer` + `UnrealBloomPass` (via the existing `lib-entry.js` addon re-export pattern), recompute on resize, and wire the auto-degrade below. If it hurts headless fps badly, that's exactly what the degrade ladder is for.
2. **FPS auto-degrade** (acceptance #19): sustained fps < 45 for 2 s → renderer DPR 2 → 1.5 → 1.0; still < 45 → bloom off. Recover upward after 10 s stable. Expose current DPR/bloom state on `__stage2` for the probe.
3. **Deferred S2 findings**: gantry tower reads as a monolith in close orbits (widen orbit radius or move tower); rocket/title center overlap (layout spacing); hints-line contrast (#66798a — measure, darken if < 4.5:1).
4. **README.md** beside index.html: run instructions (double-click, file://), controls, architecture map, design decisions + ponytail ledger (out-of-scope list from SPEC), interview notes, screenshots.
5. **GATE.md**: run the one-shot gate checklist item by item with evidence per criterion (all 21 SPEC acceptance items); kee-style adversarial read-only reviewer pass (fresh-context Agent, "find what the reviewer would fix"); every finding fixed or answered; execute the documented run path once (double-click index.html from Explorer semantics = `file:///E:/Game Build/index.html`).
6. **Final report ≤ 12 lines**, every claim citing a file path or command output; list files that exist on disk first; state that the gate reduces risk but doesn't prove absence of bugs.

## Standing rules for every session

- Probe first, watch it pass for the right reason (or red first, then fix); record mutation notes with dates in probe comments.
- `npm run build` after every source change; never touch `index.html` by hand.
- Regression: all earlier probes stay green or the slice isn't done.
- Update `one-shot-work/PROGRESS.md` at slice end (append-style); keep PLAN.md honest if details drift.
- Deliverables live only inside `E:\Game Build`; no global installs; no git unless the owner asks.
