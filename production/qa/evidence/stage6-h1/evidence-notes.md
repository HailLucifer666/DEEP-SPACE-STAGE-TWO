# stage6-h1 — evidence notes (HUD rebuild: boss bar, labeled meters, wave banner, hit markers)

Story: `production/polish/polish-plan.md` H1 · audits: `production/polish/visual-audit.md`
F1/F3/F4 (KEEP-PASSING LIST) · laws: `production/polish/scope.md` (HONESTY + ELEMENT-BUDGET).
Implementer: ui-programmer, branch `polish/stage6-experience`, 2026-11-08. `src/boss.js`
untouched (byte-zero-diff); `src/audio.js` untouched.

## Run records (raw transcripts in this directory)

| file | what it shows |
|---|---|
| `flow-red-h1.txt` | RED-FIRST: full suite on the feature-less build (harness + probe drives only — no #boss-bar/#wave-banner/#hit-mark elements, no pipper state export, meters still the text stack). **230 passed / 12 failed** — the 12 failures are exactly the H1 set, each red-by-absence (element null / surface undefined / drive fields null). The drive evidence fields read honestly on the old build (hp 34/60 sampled, 54 dying-window samples, 79 non-kill-hit samples, killConfirmed true) — the walks ran, only the new surfaces were absent. |
| `flow-green-h1.txt` | GREEN after the feature: **242 passed / 0 failed** (230 keep-passing + 12 H1). Boss bar shows/fills/hides exactly per the drive; kill-only holds (6 real non-kill hits never mark); banner WAVE 1 at entry → auto-hide → WAVE 2 re-arm on the natural increment; pipper surface agrees with the element; every new element drained on pad re-entry. |
| `flow-mutation-bossfill-removed.txt` | MUTATION (a) — the boss-bar fill-width write (`style.setProperty('--w', pct)`) removed: **239/3**. RED `boss bar fill tracks hp` (pct=null — the named target; the presence write survived, only the fill died). Two co-occurring OVERDRIVE-interval flakes (0.0762 / 0.0778 > 0.075 at frameDt 0.0213/0.0215) — the pre-existing headless timing-noise class recorded in the stage-5 riders and W1's mutation (a); unrelated to this mutation, whose surface is read on a different page entirely. No band widened. |
| `flow-mutation-bossdeath-removal.txt` | MUTATION (b) — the `!show` HIDE write removed (keep-alive-past-death): **240/2**. RED `BOSS HP bar element gone after death` (the named target) + co-red `the bar never renders BOSS 0% while dying` (visibleDuringDying=true — same root: the bar rode the dying window once the hide write was gone; both asserts protect the same removal). Pad-drain stayed green (clearCombat's own hide survives the writer mutation — the drain is independent of the render gate). |
| `flow-mutation-bossdeath-removal-misapplied.txt` | Mutation-craft note (the W1 mutation-D precedent): the FIRST (b) application removed the whole presence write instead of only the hide write — the template-shipped-hidden element never appeared and the WRONG assert red (`shows while alive`, 241/1). Kept for the record; re-applied correctly. |
| `flow-green-final.txt` | The shipped state after restore + rebuild: **242 passed / 0 failed**, CONSOLE []. |
| `boot-marks-h1.txt` | headed boot marks: MODULE → TITLE **276 ms**, TRUE wait **5059 ms** (faster than the W1 cold band 6,078-6,535 ms — the new elements are static DOM, zero per-frame layout churn), CONSOLE []. |
| `combat-probe-h1.txt` | 6/6 PASS (pause freeze/resume/audio, mute, holdfire, honest values). The honest-values NaN scan was EXTENDED to the new elements (#boss-bar/#wave-banner/#hit-mark, null-safe) per the polish plan's verification gate — all clean. |

## Assert-count delta: 232 → 242 (+10 net)

- **2 sanctioned in-place rewrites** (no count change) — the story-013 BOSS text-line asserts
  (`BOSS HP line shows in #hud-bars while alive` / `gone from #hud-bars after death`), the
  harness's independent `#hud-bars`-text sampling, and `src/probes.js`'s `BP.hud` field were
  rewritten to the new `#boss-bar` element's state. Pre-declared in the H1 card under the
  stage-5 precedent (`one-shot-work/stage-5/GATE.md:18-22`); each rewrite carries a dated
  provenance comment with the exact-coverage mapping (alive-window visibility + post-death
  absence, surface text → element). The untouched invariant `combatState().boss drains to
  null after death` is byte-intact, as is the whole keep-passing list (`git diff` on
  flow-check removes ONLY the sanctioned lines).
- **12 new H1 asserts**: meters at entry; banner WAVE 1 at entry; banner auto-hide;
  bar-shows-while-alive; bar-gone-after-death (both rewrites, counted here as the new H1
  set); fill-tracks-hp; never-BOSS-0%-while-dying; kill-only negative (6 non-kill hits);
  hit-marker on the registered kill; pipper honesty surface; banner re-arm on the natural
  increment; pad drain of all three new elements.

## Design decisions (the card's pick-one items)

- **Hit-marker anchor: the RETICLE.** The sight-confirmation convention — the confirmation
  reads where the player aims; the in-world explosion already marks the death location.
  Zero projection math in the synchronous kill sites (the C.tmp/C.tmp2 clobber hazards:
  spawnBolt's lookAt, dropAt) and no matrixWorld staleness. Documented at the template
  element comment + the combat.js writer block. The marker freezes at the show-time reticle
  position for its ~150 ms life (a per-frame follow would add pointer-coupled writes for a
  150 ms element).
- **Boss-bar hue: amber fill** (`#ffc85a` — the boss weak-point node's own color language,
  boss.js buildBoss), cyan label/track (the scope.md color rule: brackets/labels cyan; amber
  is the elite/boss language, and the boss bar IS the boss).
- **Wave banner announces BOTH wave starts**: the enterCombat entry wave (WAVE 1 — combat
  entry is a wave start) and the wavesTick increment (`C.bannerT = BANNER_T` at the real
  increment point). The reveal is the `#combat-online` grammar re-instance (opacity/blur/
  scale + .on); top strip, never the reticle center; `hidden` on expiry (drains to display:
  none — the pad-drain law reads it directly).
- **Boss kill: NO hit marker.** Kill-only means the REGISTERED-kill paths — the two
  `C.kills++` sites (raider/gunner bolt kills, orb bolt kills) in weapons.js. The boss kill
  runs its own path (hitBoss → the cinematic; no C.kills++, story-014 owns the rewards) and
  the bossProbe page's 6 real non-kill hits prove the negative half of the law.
- **pipper divergenceDeg**: the angular companion (NDC pointer → camera-frustum angle) of the
  SAME pointer read the px gate uses. The visibility LAW stays px-based (PIPPER_ON_PX — W1's
  documented threshold); the deg field is the readable state, computed once per hudTick and
  STORED — `combatState().pipper` reads the writer's own stored state, never recomputes.
- **BOOST gained a track**: the old write was text-only (`BOOST 100%`); the card asks for
  label + track + fill on all three meters, same underlying value (honesty law: the fill IS
  the value — `fmt(C.boost*100)` writes both the label and the width).

## Honesty-surface notes

- `combatState()` gains `pipper {visible, divergenceDeg}`, `bannerVisible`, `markerVisible`.
  `bannerVisible` reads the writer's change-gate signal; the drained signal is `''` (not
  null) so the field reads FALSE outside combat — caught during bring-up (a `null` gate
  would have made `bannerVisible` read true on the pad; fixed before the green run).
- The `--w` custom property carries the 5%-stepped fill fraction (the charge-meter `--p`
  pattern); the drive samples it against its scripted hp state (34/60 → expected 55).

## Harness findings during bring-up (recorded, never quiet edits)

1. The balance drive (stage 8.5) yields the wave pin for ONE natural increment — the only
   `wavesTick` advance in the whole battery (every other drive pins the wave at 1). The
   wave-clear bonus that rides the same event is absorbed by the delta-based score/telemetry
   asserts (every mark is captured after that stage); the increment's wave-2 spawns are
   drained same-tick and the pin semantics restored before the table walk.
2. Mutation (b) mis-application (above) — wrong-form removal reds the wrong assert because
   the element ships `hidden`; the hide write is the load-bearing half for the death
   contract, the show write for the presence contract.
3. OVERDRIVE interval flakes under mutation (a) — the recorded pre-existing class (stage-5
   riders note 3 / W1 note 3); cleared on the restore run (242/0). No band widened.

## Deliberately not done

- No radar/minimap, no enemy health bars, no UI hover sounds — P3 flag-only items (the plan).
- No hide transition on the banner (display:none on expiry) — the reveal transition is the
  grammar; the expiry is a drain, and the pad-drain law reads `hidden`.
- No marker on boss zone HITS (damage markers are per-hit noise — kill-only law) nor on the
  boss kill (not a registered kill — see above).
- `src/boss.js` and `src/audio.js` byte-untouched; `src/weapons.js` changes are the two
  additive kill-site stamps + the seam const (no logic touched); `#tele` untouched; the
  ascent HUD untouched (meters stay combat-only via the existing clearCombat drains).
