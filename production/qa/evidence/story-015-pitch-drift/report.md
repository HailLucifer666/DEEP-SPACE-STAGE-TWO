# story-015 — pitch + drift: the keystone (full 3D flight begins)

> **Status**: DONE_WITH_CONCERNS (one flagged design-number re-derivation — see §7.1)
> **Branch**: `story-015-pitch-drift` (base: stage-3 setup @ 808f4ae)
> **Date**: 2026-11-05
> **Spec of record**: `production/epics/combat-feel-fix/story-015-pitch-drift.md` + `design/gdd/full-3d-flight.md` §3.0-3.4, §4, §5, §8.1

## 1. What was implemented (per GDD section)

**§3.0 — the keystone: `forward()` goes 3D** (`src/combat.js`). One function change:
`(sin h · cos φ, sin φ, cos h · cos φ)`. Consumers that gain the vertical component from
this one change, verified: ship velocity (via the drift target), player bolts (fire path +
`noseWorld` rides the pose), chase camera (look-target + position), probe spawns
(droneProbe/bossProbe/scriptedKill pass `forward`-based offsets — valid because pitch = 0
at combat entry, the reset contract assert 3 guards it). Pose: `p.rotation.x = −φ` into the
existing `YXZ` group (negative per the GDD's YXZ derivation; bank stays the innermost roll).

**§3.1 — pitch command model** (`steer()`): `pitchCmd = clamp(keyPitch + pointerPitch, −1.25, 1.25)`,
pointer-Y DIRECT (above center = nose up — `input.mouse.y` is NDC-up-positive and was
unused; zero `src/input.js` changes), deadzone 0.08 identical to yaw's, R = up / F = down,
`dφ/dt = pitchCmd · PITCH_RATE` under the `±PITCH_MAX` clamp. `PITCH_INVERT = false` const
flips the pointer convention only. Constants in the owning module header (project
convention): `PITCH_RATE 1.8`, `PITCH_MAX 1.2566`, `PITCH_DEADZONE 0.08`, `PITCH_INVERT false`,
`ALIGN_RATE 4.5`, `BAND_H 16`, `BAND_HH 20` (+ `RAIDER_ALT_FOLLOW 1.2` in enemies.js).
Controls text updated in BOTH places: `PANEL_HTML.CONTROLS` (main.js) and the hint bar
(`tools/index.template.html`) — panel verified in `s15-controls-panel.png`.

**§3.2 — drift**: `vel` is a PERSISTENT state:
`C.vel.lerp(forward3D · C.speed, 1 − exp(−ALIGN_RATE · dt))` (three.js `lerp` IS the exp
form — dt-scaled under DT_CLAMP 0.05, never a per-frame multiplier; R3). `C.speed` stays
the throttle scalar; SPD keeps showing it; `velMag` rides `combatState()` for the harness
only (§8 player-decision c). **Load-bearing order honored (GDD §4.5)**: pitch/yaw integrate
→ drift alignment → rim bleed → band bleed → position integration → hard clamps. At speed 0
drift is inert (story-004's turn-in-place assert passed untouched in every run).

**§3.3 — chase camera**: look-target y UNPINNED from `ARENA_Y` → `pos.y + 4·sin φ`
(the one flagged line); position formula survives with the 3D forward and keeps its
WORLD-up +3.4.

**§3.4 — altitude band scaffold**: soft bleed inside `[ARENA_Y − 16, ARENA_Y + 16]` with
story-005's exact cap-and-floor formula (floor 3 u/s), hard ±20 clamp, `#warn` extended to
the band with the same element/grammar (`hidden = (r ≤ R_SOFT && dY ≤ BAND_H) || C.dead`).
Built clean and isolated — story-016 deletes the two consts, the two blocks, and their
asserts as a documented retirement.

**§5.4 riding items** (`src/enemies.js`): enemy-bolt × player hit and raider-ram contact
converted to the full-3D squared-distance form (the drone scan's proven shape; `dx/dz` stay
the steering basis — raider steering remains XZ-only by design, `lookAt` stays yaw-only);
the one-line altitude-follow per raider tick using the boss's altitude-lerp pattern
(boss.js L323) at quarter rate. Player-bolt × raider scan went 3D in combat.js.

**`?pitchProbe=1` deterministic drive** (combat.js, droneProbe/bossProbe pattern): walks
pitch integration, pointer direct/mirror/deadzone, the 72° clamp hold, drift
slip/magnitude/recovery, a one-rev circle, a pitched bolt through the REAL spawn path, the
band climb, and both raider retunes; reports `window.__stage2.pitchProbe` =
`{ entryPitch, dPhi, slip, driftPath, boltRise, band, raiderScan, raiderFollow }` with
`lastReport` parity via `api.report`; `pitchProbeLive` is the screenshot hook;
`enterCombat` resets the probe state and deletes the report (bossProbe hygiene).

**R1 re-check (risk register)**: boss.js's lookAts (L307/L324) are horizontal-only — they
look at the boss's OWN y, so the ship being above/below changes nothing; read, no change
made (as the story predicted). Camera: world-up +3.4 never inverts inside 72°; the clamp IS
the mitigation. `scriptedKill` probe bolt at `ARENA_Y` (L342): still valid — pitch = 0 in
its 0.4-1.4 s window (combat-entry reset; assert 3 guards it); its `forward`-based offsets
are identical to the old planar form at φ = 0.

## 2. Red-first record

`flow-red-story015.txt` — stage-2 close build, product code untouched, only the harness
differing: **77 passed / 21 failed**. All 76 existing asserts green; the 22nd new assert
(`CONSOLE [] (pitchProbe page)`) green BY DESIGN (the unmodified page ignores the unknown
query flag and dies cleanly to the wave, like every other idle-combat page). The 21 probe
asserts each failed for the stated reason: no `?pitchProbe=1` handler exists, so
`window.__stage2.pitchProbe` never appears and the 120 s deadline expires (each assert
records its red from the null probe — the exact droneProbe red pattern);
`combatState().pitch`/`velMag` read `undefined` (`typeof 'undefined'`).

## 3. Final gate outputs (shipped build)

| Gate | Result |
| --- | --- |
| `node tools/flow-check.mjs` | **98 passed / 0 failed** (`flow-green-final.txt`; branch green in `flow-green-branch.txt`), every page `CONSOLE []` |
| `node tools/dep-check.mjs` | **PASS** — acyclic; main.js **500/500** |
| `?goto=combat&restartProbe=3` | **`{"runs":3,"left":0,"clean":true}`** — three identical entries `{hp:100, shield:50, score:0, wave:1, particles:0, bolts:0, entities:31}`, `CONSOLE []`; `combatState()` shows `pitch:0, velMag:0` on the surface |
| `tools/boot-marks.mjs` (headed, RTX 3060) | **MODULE → TITLE 154 ms** (< 1000 gate); `rocket:glb`; b64 decode 20/23 ms, gltf.parse 80/40 ms — inside the documented 158-2492 ms GLB variance band; fps 60; `CONSOLE []` |
| Evidence screenshots | `s15-pitched-climb.png` (nose ~72° climbing, SPD 17), `s15-controls-panel.png` (pitch line in the CONTROLS panel) |

Keep-passing: the story-004 movement set, story-005 boundary block, story-012 drone,
story-013 boss, and story-014 victory blocks all passed UNCHANGED in every run — **no
displacement number shifted enough to re-derive**: the drift's bleed-last ordering kept the
rim equilibrium (GDD §3.2's prediction held; `soft rim bleeds radial speed ≤13` and
`rim slides (carry >5u)` both stayed green).

**Probe report (final green run)** — every number inside its tolerance:
`rHold04 0.7499` (0.72±0.05; ≈1 frame of headless-rAF skew, inside tolerance at any fps),
`headingDrift 0`, `ptrUp +1.2566 / ptrDown −1.2566` (saturate at the clamp — ≥0.5 with
margin), `deadzone 0`, `clampEnd/clampMax 1.2566` (never above), `fHold04 −0.72`,
`slip 24.69°` (20-35°), `velMag 15.349 / speed 16.57` (ratio 0.926 ≥ 0.9),
`recoveredDeg 0.55` (< 8°), `driftPath radius 7.01` ([6.5, 7.3]; radiusMax 8.48),
`boltRise dy 14.85` (analytic 42·sin45°·0.5 = 14.849 exactly), `xzSpeed 29.7`
(= BOLT_SPEED·cos45° exactly), `band maxYDev 20 / maxVyInLayer 8.74 ≤ 13 / warnSeen true`,
`raiderScan {ramContact:false, boltHit:false}`, `raiderFollow {offset0:20, meanDelta:5.77 ≤ 12}`.

## 4. Mutation record (each: mutate → `npm run build` → full flow-check → restore → rebuild;
every red VERIFIED by reading its output — a silent no-op proves nothing)

| # | Mutation | Output | Observed red |
| --- | --- | --- | --- |
| 1 | combat.js `PITCH_RATE 1.8 → 0.9` (2026-11-05) | `flow-mutation-pitchrate.txt` — **96/2** | `R 0.4s pitches 0.72 rad` (**Δφ 0.3749**) + mirror `F pitches down` (−0.36). Adjacent keep-passing: `pitch and yaw independent` green — the mutation changes rate, not axis coupling |
| 2 | combat.js `ALIGN_RATE 4.5 → 99` (2026-11-05) | `flow-mutation-alignrate.txt` — **96/2** | `drift slip present` (**slip 0.5°** — collapsed, ≥99 disables drift per GDD §7) + `full-turn circle radius` (**r 7.65** — reverts to the flat build; the radius assert discriminates drift-off). Adjacent keep-passing: `drift preserves magnitude` green (vel stays ≈ forward·speed), as the story names |
| 3 | enemies.js bolt×player scan back to XZ (dy² dropped) (2026-11-05) | `flow-mutation-boltscan-xz.txt` — **97/1** | `raider scans 3D` (**boltHit:true** — the elevated raider's bolts hit through 20 u of pure vertical separation; the exact anti-camp regression this story fixes). Adjacent keep-passing: `raider altitude-follow` green, as the story names |
| 4 | enemies.js `RAIDER_ALT_FOLLOW 1.2 → 0` (2026-11-05) | `flow-mutation-altfollow0.txt` — **97/1** | `raider altitude-follow` (**meanΔ 20** — the full offset never closed). Adjacent keep-passing: `raider scans 3D` green (the pin makes it independent) and the wave-1 raider-count entry assert green (spawn logic untouched), as the story names |
| 5 | combat.js band guards removed — soft bleed cap AND hard clamp (dY kept for `#warn`) (2026-11-05) | `flow-mutation-band.txt` — **96/2** | `altitude band holds` (**maxYDev 34.22**) + `band vertical speed ≤ 13` (**maxVy 16.13**) — the story's expected 17-18 pair. See §7.3 for why BOTH guards must go for this pair |

All five mutations restored; the shipped build re-verified (`flow-green-final.txt` 98/98).

## 5. Files touched (exactly the story's pre-authorized list)

- `src/combat.js` — pitch state + header constants, 3D `forward()`, steer() pitch/drift/band
  (load-bearing order), camera look-target unpin, pose `rotation.x = −φ`, enterCombat
  `C.pitch = 0` reset + probe hygiene, combatState `pitch`/`velMag`, `?pitchProbe=1` drive,
  player-bolt × raider 3D scan
- `src/enemies.js` — two 3D collision scans (bolt×player, ram contact) + the
  altitude-follow line + `RAIDER_ALT_FOLLOW`
- `src/main.js` — `PANEL_HTML.CONTROLS` pitch line (rides an existing physical line — the
  TD-003 500-line ceiling is load-bearing)
- `tools/index.template.html` — hint bar pitch line
- `tools/flow-check.mjs` — pitchProbe block (22 asserts) + red/mutation records inline
- `index.html` — regenerated by `npm run build` (never hand-edited)
- `production/qa/evidence/story-015-pitch-drift/` — this report, red/green/mutation outputs, screenshots

NOT touched (per the story's constraints): `src/boss.js`, `src/drone.js`, `src/audio.js`,
`src/launch.js`, `src/phases.js`, `src/input.js`.

## 6. Harness notes

- The probe synthesizes R/F into the REAL key set and writes the pointer NDC into the SAME
  mouse object `steer()` reads — zero input.js changes, as designed.
- Probe-owned preconditions (bossProbe `probeHold`/`probeDamage` precedent): `C.pitch`
  reset to 0 between pitch sub-tests so each window measures unsaturated; ship re-seated
  before the circle/band/follow stages; heal AFTER the scan window (a ~22 s drive must not
  die mid-walk; the scan window itself heals NOTHING — its no-damage signal is hp+shield
  drop or a `regenT` reset).
- Scan-window pinning: the two probe raiders are position-pinned at +20 for the 2 s window
  because their own LIVE altitude-follow would enter ram range at t ≈ 2.01 s
  (20·exp(−1.2·t) < 1.8) — inside the window. The follow mechanic is measured LIVE by the
  follow stage (two probe gunners, +20 offset, 3 s, mean Δy 5.77-5.77 u).
- Frame-rate robustness: the exp forms make the sampled numbers dt-independent to 3
  decimals (verified by simulation at dt 1/30, 1/60, 1/120); tolerances hold at any fps.

## 7. Deviations and flagged items

1. **FLAGGED RE-DERIVATION — assert 14 (driftPath radius).** GDD §4.3 / story AC predicted
   the sustained-turn radius GROWS 7.7 → 9-11 u ("the drift tax on tight turns"). The
   APPROVED FORMULA traces it SHRINKING: in a steady full turn, drift reduces |vel| to
   `speed · ALIGN²/(ALIGN² + ω²)` = 0.898·speed (17 → 15.27 u/s), and the path radius is
   `|vel|/ω` = 15.27/2.2 ≈ **6.94 u** (flat build: speed/ω = 7.73). Verified by exact
   discrete simulation at dt 1/30, 1/60, 1/120 and by two measured builds: one-rev
   mean-to-centroid 6.92-7.01 u (aligned entry; 6.943 steady), flat build 7.73. The drift
   FEEL is real and measured (entry swing radiusMax 8.15-8.48 vs flat 7.73; slip 25°;
   |vel| scrubs 6% in a sustained turn), but "the drift tax widens the circle" is
   directionally wrong for its own formula — the sustained circle TIGHTENS. The formula was
   implemented EXACTLY as approved; the ASSERT encodes the measured build ([6.5, 7.3] u,
   which the flat build at 7.73 fails — it discriminates). **This needs a game-designer
   decision on the AC number (and the GDD §4.3 text) — not retunable in code.**
2. **Band vy sample layer.** The story says "vertical speed ≤ 13 measured in the 16-20
   band"; sampling just past depth 17 carries a one-frame entry lag (the cap engages on
   PRE-integration depth, so a 17-layer sample can still read the pre-edge cap — measured
   14.54 at headless ~30 fps). The probe samples the 18-20 layer (2+ u inside the soft
   edge), mirroring story-005's 5-inside-of-20 rim sampling. Assert number (≤ 13) unchanged;
   this is a measurement-depth choice, not an assert-semantic edit.
3. **Mutation 5 scope.** "Band bleed cap removed" alone reds only assert 18: the hard
   clamp is absolute, so position still pins at maxYDev 20.0 and assert 17 cannot fail
   (determined analytically — cap(d) floors at 3 u/s but the ±20 clamp bounds position
   regardless; not mutation-run separately). The story's expected red pair (17-18)
   requires removing BOTH band guards; the mutation removed the soft cap and the hard
   clamp together (dY computation kept so the `#warn` line cannot ReferenceError the page
   and muddy the run). Recorded exactly.
4. **Hint-bar casing.** The story's line "R / F or MOUSE ↕ — pitch" is carried verbatim in
   the CONTROLS panel; the hint bar renders it as `R/F or MOUSE ↕ — PITCH` to match that
   bar's all-caps `·`-separated grammar.
5. **main.js 500-line ceiling.** The pitch `<p>` rides the throttle row's physical line
   (two strings, one line) to hold dep-check's TD-003 limit at exactly 500.
6. **Assert 22 (`CONSOLE [] (pitchProbe page)`) is green on the red run BY DESIGN** —
   documented in the harness block comment (droneProbe precedent: `raider wave rule
   unchanged` was green-on-master).

## 8. Unlocks verified for story-016

`combatState().{pitch, velMag}` live; the pitchProbe surface reports; the band scaffold is
isolated (two consts + two blocks + the warn term) for its documented retirement; probe
spawns stay deterministic at φ = 0 (reset contract asserted). The band asserts (17-19) are
the ones story-016 retires — they are named and grouped for that removal.

---

**STATUS: DONE_WITH_CONCERNS** — all gates green (98/98 flow, dep-check PASS, restartProbe
clean, boot 154 ms), 5/5 mutations verified red, keep-passing untouched; the one concern is
§7.1: the approved drift formula provably tightens the sustained-turn circle (≈6.94 u) where
the GDD/story predicted 9-11 u — the assert encodes measured reality and the AC number needs
a game-designer decision (the formula itself is exactly as approved and is NOT the concern).
