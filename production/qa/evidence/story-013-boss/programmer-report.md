# Story 013 — boss fight (multi-phase, HUD HP bar, weak point, slow-mo death) + TD-013/014/015 — programmer report

> Branch: `story-013-boss-fight` · Baseline: master b0eff8d (branch tip at start — the RED run
> therefore tested master's committed build) · Written 2026-11-04
> Status: **DONE** — all ACs machine-proven; 4 mutations recorded; the three riding TD fixes
> each carry a probe or a pinned reason.

## 1. What was implemented

1. **`src/boss.js` (new)** — the sector warden: a SINGLE-entity state machine (no pool —
   exactly one boss; the group is built once at `prepareBoss`, spawned/shown/hidden by state,
   so the restart entity baseline is stable: 25 → 31 scene meshes, equal on every run).
   Reads like drone.js (state object B, prepare/spawn/tick/clear), knobs as named constants:
   `BOSS_HP 60 · CHARGE_AT 0.66 · RAGE_AT 0.33 · RAGE_MULT 1.6 · VOLLEY_INTERVAL 2.4 ·
   VOLLEY_ROUNDS 3 · TELEGRAPH_T 0.8 · CHARGE_SPEED 30 · OVERSHOOT 10 · BOSS_RAM 25 ·
   WEAK_MULT 3 · NODE_R 0.95 · RING_R 2.0 · DEATH_SCALE 0.3 · DEATH_T 1.2 · BOSS_WAVE 5`.
   - **Phases** (transitions are a pure function of hp/maxHp, checked every tick + every hit):
     **orbit+volley** (>66%: radial seek holds ring 25–35 u, aimed 3-round volleys with
     gunner-style spread) → **charge** (66–33%: first telegraph 1.5 s into the phase, then
     every 5 s — a 0.8 s flare telegraph, then a 30 u/s dash at the ship's position captured
     AT LAUNCH; the dash OVERSHOOTS 10 u past the captured point and re-orbits — full stops
     are ram-bait per review r2; ram contact = rammer-rule 25, once per dash) → **rage**
     (<33%: volley cadence ×1.6, orbit tightens to 20 u, halo/node glow pushed up).
   - **Weak point**: a bright unlit amber sphere at the ring's center as a separately-hittable
     ZONE (`boltHit()` → 2 node · 1 hull · 0 none). The hull is the torus centerline band in
     the boss's local plane (the hole faces the ship, drone.js eye language), so a center-shot
     threads the hole and reaches the node while an edge shot pays 1×. `WEAK_MULT` applies
     INSIDE `hitBoss` — combat.js's bolt scan stays multiplier-ignorant. Bolts hitting the
     node do 3× damage; boss HP 60 ≈ 20 body hits / 7 node hits.
   - **Slow-mo death**: hp 0 → `setTimeScale(0.3)` for `DEATH_T = 1.2 s` of REAL time
     (the combat.js player-death real-time clock pattern), chained explosions every 0.18 s
     through the existing EFFECTS pools + shake, a final burst, then `api.report({ bossDefeated })`
     (story-014's hook) and the entity drains. During dying the boss still blocks wave
     progression (`alive()` true until the cinematic ends).
   - **Visual language** (story-012 drone): torus ring + inner trim ring + 3 fins + additive
     halo sprite + node halo; phase stingers, dash noise, volley sweeps through audio.js.
2. **Wave gate (`src/combat.js` `wavesTick`)** — the wave-clear condition also waits on
   `!BOSS.alive()`; at the wave-increment line, `C.wave > BOSS_WAVE && BOSS.eligible()` spawns
   the boss **instead of** starting wave 6 (no raiders that wave). **Design decision
   (reported)**: the spawn-once latch lives INSIDE boss.js (`B.spawned`, re-armed only by
   `clearBoss`) — the boss owns its lifecycle end-to-end like drones own their wave queue;
   combat.js only consults `eligible()`/`alive()` and calls `spawnBoss(C.pos)`. After the
   boss dies, waves continue normally (wave 7+) until story-014 wires victory.
3. **Bolt-pool decision (reported)**: the boss volley reuses the ENEMY-bolt pool via a
   `fireEBolt(fromPos, dir)` export in enemies.js — the story's one pre-authorized change
   there. Reasons: the dodgeable philosophy (speed 20, spread, player-hit rule) is guaranteed
   identical because it IS the same pool; zero new allocation keeps the restart baseline
   untouched; `clearEnemies()` already drains the boss's bolts on every combat exit.
4. **HUD HP bar** — a `BOSS ▍▍▍ 62%` line (glyph segments = round(hp/maxHp·10), pct = ceil)
   rides the EXISTING change-gated `#hud-bars` wholesale write in `tickCombat` — presentation
   only (state lives in `combatState().boss`), present while the boss lives, gone after death.
   **No template change** (the `#hud-bars` path needs no DOM element).
5. **`combatState()`** — `boss: BOSS.state()` fills the story-012-declared slot:
   `{ hp, maxHp, phase }` (phase includes a brief `'dying'`) or `null` after death/drain.
6. **Probe `?bossProbe=1`** (combat.js `bossProbeTick`, droneProbe pattern): spawns the boss
   26 u ahead 0.4 s into combat (skipping the wave-5 wait — `spawnWave: 1` proves it), then
   drives the machine end-to-end: (a) **ratio test** — the boss is PINNED (`probeHold`;
   transitions + glow stay live) and THREE real player bolts are fired into the node vs THREE
   into the ring hull; (b) **phase walk** — scripted damage (`probeDamage`) takes hp to 57%
   then 25% (raw damage, deliberately excluded from the ratio counters); (c) **death** — hp 0
   → slow-mo → `bossDefeated`. Reports `window.__stage2.bossProbe = { phases, weakHits,
   bodyHits, weakDmg, bodyDmg, ratio, chargeDash, overshoot, deathSlowmo, spawnWave, hudLine,
   bossDefeated }` + `lastReport` parity. `?bossShot=1` is the evidence variant (14 u spawn,
   rage framed 14 u ahead, `bossShotPhase` markers) consumed by `tools/boss-shot.mjs`.
7. **TD-013 (`src/loop.js`)** — both render sites now go through `renderFrame()`: the composer
   render is guarded; the FIRST render-time throw logs one line and latches `composerDead` →
   direct render permanently. `probs.post` flips to **'direct'** (distinct from 'off' =
   chain never built) so the probe surface stays honest. `?composerFault=1` throws inside the
   guarded call once for the probe.
8. **TD-014 (`src/combat.js` `clearCombat`)** — `C.ui.tele.textContent = ''` beside the
   `#hud-bars` clear: the SPD line is combat's write and must not ride the pad until cruise
   rewrites. No phases.js change needed — its `lastSpd` gate is already reset on combat.enter
   (story-010 shipped that half), so the pad shows empty `#tele` and re-entry rewrites cleanly.
9. **TD-015 (`src/audio.js`)** — the bag-creation body (`crossfadeTo`, both call paths:
   `musicTo` and the deferred `musicFlush`) is wrapped in try/catch: one warn line, then the
   honest `'none'` state (both bags dead — the dying bed was already stopped);
   `musicState()` reflects it. `?musicFault=1` throws once inside the combat-bed build.
10. **`tools/boss-shot.mjs` (new, committed evidence tool)** — captures the three retained
    screenshots via CDP off the probe's phase markers. (Not in the story's file list — added
    on the story-012 `drone-glb-probe.mjs` precedent: the AC requires retained screenshots,
    which require a runner. Flagged for review.)

**Untouched by design**: `src/pool.js` (fenced), `src/main.js` (probe surface already had
everything), `src/phases.js`, `src/drone.js`, `tools/index.template.html`, raider/wave
difficulty tables, story-014 victory-card work.

## 2. Red-before-green + mutation records (kee)

**RED on master** — `flow-red-master.txt`: **43 passed / 13 failed** (harness only; the
committed index.html was master's build). Each red with its reason:
- `REPLAY → pad: #tele empty (TD-014)` — `tele="SPD 17 u/s"`: the stale SPD line rides the
  pad (the TD-014 bug itself, reproduced).
- 8 boss asserts — `bossProbe reports` null and the rest undefined: no boss.js on master,
  `?bossProbe=1` unread, deadline expired (guarded-poll pattern records the reds).
- `TD-013 composer throw degrades post to 'direct'` — post stayed `bloom` (no fault switch,
  no degrade path exists on master); `TD-013 one-line degrade logged once` — `[]`.
- `TD-015 musicState reflects 'none'` — `music=combat` (no fault switch); `TD-015 one-line
  warn logged` — `[]`.
Green-on-master by design (keep-passing): `boss slot null before spawn` (the story-012 field
shape), `BOSS HP line gone after death` / `combatState().boss drains to null` (vacuous without
a boss), `TD-013 game keeps running`, `TD-015 phase lands` / `no uncaught exception`.

**GREEN on branch**: `flow-green-branch.txt` **56 passed / 0 failed** — 37 original + 19 new
(1 keep-passing boss-slot + 1 TD-014 + 10 boss-probe + 3 TD-013 + 4 TD-015).

**Final green** (shipped build, re-run after the last product change): `flow-green-final.txt`
**56 passed / 0 failed**, `CONSOLE []`.

**Mutations** (each: mutate → `npm run build` → full flow-check → restore → rebuild):

| # | Mutation | Result |
| --- | --- | --- |
| 1 | boss.js `WEAK_MULT 3 → 1` | `flow-mutation-weakmult.txt` — **55/1**: RED `weak point 3× damage` (w=3hits/3dmg b=3hits/3dmg **r=1**) — the required AC mutation |
| 2 | boss.js `CHARGE_AT 0.66 → 0` | `flow-mutation-chargegate.txt` — **54/2**: RED `phases entered in order` (phaseLog `["orbit","rage"]` — charge unreachable) + RED `charge dash launches and overshoots` |
| 3 | combat.js TD-014 `#tele` clear removed | `flow-mutation-teleclear.txt` — **55/1**: RED `REPLAY → pad: #tele empty` (`tele="SPD 17 u/s"`) |
| 4 | loop.js `probs.post = 'direct'` removed | `flow-mutation-postsurface.txt` — **55/1**: RED `TD-013 composer throw degrades` (`post=bloom`) while the degrade itself still runs (running + warn stay green — the probe watches the real flag) |

## 3. Probe outputs (real numbers)

**bossProbe sample (final green run)**:
```json
{"phases":["orbit","charge","rage"],"weakHits":3,"bodyHits":3,"weakDmg":9,"bodyDmg":3,
 "ratio":3,"chargeDash":true,"overshoot":true,"deathSlowmo":true,"spawnWave":1,
 "hudLine":true,"bossDefeated":{"weakHits":3,"bodyHits":3,"slowmo":true}}
```
- Phases entered in order under scripted damage: `["orbit","charge","rage"]`; the charge dash
  launched after its 0.8 s telegraph and overshot (no full stop).
- Weak point end-to-end: 3 node-zone bolt hits dealt 9 dmg vs 3 hull-zone hits dealing 3 dmg
  — ratio exactly 3 (zone detection + multiplier through the real bolt scan, boss pinned).
- Death: slow-mo engaged (timeScale 0.3 recorded during the cinematic), `bossDefeated`
  reported through `api.report`.
- HUD: the `BOSS ▍▍▍ …%` line sampled present in `#hud-bars` while alive (probe-side AND
  harness-side sampling), absent after death.

| Probe | Result |
| --- | --- |
| `node tools/flow-check.mjs` | **56/56 PASS**, `CONSOLE []` (branch + final; master red 43/13 recorded) |
| `?goto=combat&restartProbe=3` | **`{"runs":3,"left":0,"clean":true}`** — entries identical `{hp:100, shield:50, score:0, wave:1, particles:0, bolts:0, entities:31}`; the boss's 6 always-built meshes are in the baseline and `clearBoss` adds/removes nothing |
| `?goto=combat&scriptedKill=1` ×2 | bolt kill lands both runs (`score:200, kills:2, particles:12`) — `CONSOLE []` |
| `?goto=launch` | `phase:ascent`, `rocket:glb`, `CONSOLE []` |
| `?goto=transition` | walk lands combat (`combatEntries:1`, `music:combat`), `CONSOLE []` |
| `?goto=combat&bossProbe=1` | full machine walk (above), `CONSOLE []` |
| `?goto=combat&composerFault=1` | `post:direct`, game kept running through later phase transitions, exactly one degrade line |
| `?debug=1&musicFault=1` → skip | phase lands combat, `musicState:'none'`, one warn, no uncaught exception |
| `?corruptGlb=1` | `rocket:fallback`, boots to title; 2 logged errors = the DESIGNED never-crash degrade (story-011 parity) |
| `?spin=1` | spin viewer on the GLB rocket, `CONSOLE []` |
| `tools/combat-probe.mjs` | pause-freeze / pause-audio / resume / mute / holdfire / honest HUD — **6/6 PASS**, `CONSOLE []` |
| `tools/death-card-check.mjs` | CELL_A 173 ms card, C_OFF no-op, C_ON → combat entries 2, CELL_D shows 1/hides 1 — `CONSOLE []` |
| `node tools/dep-check.mjs` | **PASS** — acyclic; new edges `combat.js → boss.js`, `boss.js → enemies.js, audio.js`; main.js 500/500 |
| `node tools/boss-shot.mjs` | 3 screenshots retained (below) |

**Screenshots**: `s13-boss-orbit.png` (boss ring+node+halo ahead of the ship, `BOSS … 90%`),
`s13-boss-charge.png` (dash/telegraph flare closing on the ship, `BOSS … 67%`),
`s13-boss-rage.png` (boss framed 14 u ahead, glow intensity up, `BOSS ▍▍▍ 25%`) — the HUD
line visible under BOOST in all three.

## 4. TD-013 / TD-014 / TD-015 evidence (inline)

- **TD-013** — `?composerFault=1`: first composer render throw → `probs.post` flips
  `'bloom' → 'direct'`, exactly ONE `composer render threw … degrading to direct render
  permanently` error line, game keeps running (fps ~34-44, later phase transitions survive).
  Mutation 4 proves the probe watches the honest surface. Residual note: the TD's contract is
  the render CALL; `dprTick`'s recovery path (`composer.setPixelRatio` after sustained low
  fps) is a separate unguarded site — flagged, not in this TD's scope.
- **TD-014** — master red reproduced the bug (`tele="SPD 17 u/s"` riding the pad); the fix
  clears combat's `#tele` write in `clearCombat` beside the `#hud-bars` clear; probe asserts
  the pad's `#tele` is empty after REPLAY; mutation 3 re-creates the bug on the branch.
- **TD-015** — the fault fires inside `combat.enter`'s `musicTo` (a live phase-enter hook:
  audio unlocked with a real CDP key event first, then SKIP): the phase still lands
  (`combat`), `musicState()` reads the honest `'none'`, one warn line, no uncaught exception.
  The guard wraps `crossfadeTo` — both the direct `musicTo` path and the deferred
  `musicFlush` path are covered.

## 5. Files changed (exact paths)

- `src/boss.js` — **new**, the single-entity boss state machine
- `src/combat.js` — wave gate, boss bolt scan, HUD line, `boss: BOSS.state()`, boss probe,
  enter/clear drains, TD-014 `#tele` clear
- `src/enemies.js` — `fireEBolt` export ONLY (the story's one pre-authorized change; diff
  verified to contain nothing else)
- `src/loop.js` — TD-013 guarded `renderFrame()` + `?composerFault=1`
- `src/audio.js` — TD-015 guarded `crossfadeTo` + `?musicFault=1`
- `tools/flow-check.mjs` — 19 new asserts + red/mutation records in comments
- `tools/boss-shot.mjs` — **new**, committed evidence-capture tool
- `index.html` — regenerated by `npm run build` only
- `production/qa/evidence/story-013-boss/` — this report, 7 flow logs, 3 screenshots

**Pre-authorization respected** (`git status`): `pool.js`, `main.js`, `phases.js`,
`drone.js`, `index.template.html` untouched; `enemies.js` carries only the bolt-helper export.

## 6. Self-review findings / reported judgment calls

1. **`bossDefeated` vs the single `lastReport` slot**: the boss death report and the probe
   report both land on `api.report`, and the probe's lands last — so the probe carries the
   `bossDefeated` payload it observed (`bossDefeated` field) and the harness asserts on that.
   Story-014 should wire the victory card off the boss-death EVENT (boss.js calls the report
   the moment the cinematic ends), not by polling the slot — if the player dies during the
   1.2 s cinematic, combat tears down before the report fires and the signal is lost.
   **Flagged for story-014's design.**
2. **Slow-mo restore edge**: if the PLAYER dies during the boss's death cinematic, the boss
   restores `timeScale` to 1 at cinematic end while the player's slow-mo is still running —
   the remaining player slow-mo loses its visual for ≤ 1.2 s (the card's timing is unaffected:
   `deathT` is a real-time clock). Cosmetic; noted rather than guarded (boss.js cannot see
   player state without a new coupling).
3. **No score/kills for the boss** — the spec is silent; wave-clear score already grants
   `SCORE_WAVE × wave` around the boss wave. Story-014 owns victory rewards.
4. **Boss ram = 25** (the rammer rule) — the spec gives no contact damage; reused the
   existing convention, once per dash.
5. **The probe pins the boss** during the ratio test (and frames it for the rage screenshot):
   the drone probe sampled natural flight, but this probe asserts DAMAGE, and pinning is the
   honest way to make damage deterministic (scriptedKill's precedent is full placement
   control). Transitions and glow stay live during the pin; behavior resumes for the
   charge/rage walk.
6. **Weak-point geometry** — the node sits at the ring's center and the hull zone is the torus
   centerline band, so the weak point is a real aim-skill target (thread the hole ≈ 15% of the
   frontal area vs the hull band). The bolt-vs-zone check runs per frame with 0.7 u steps
   against a 0.95 u node zone — no tunneling (a step cannot jump the sphere).
7. **The `?musicFault` switch scopes to the combat bed** — the title bed builds at unlock and
   must not consume the fault; the probe needs the throw INSIDE `combat.enter`'s hook.
8. **`?bossShot=1` evidence variant** changes framing (14 u spawn, rage pin) but not the
   drive or its asserts; flow-check never sets it.
9. **`build/boss-smoke.mjs` / `build/phase-smoke.mjs`** are uncommitted scratch runners under
   the gitignored build area (smoke before the gated runs); the committed evidence tool is
   `tools/boss-shot.mjs`.
