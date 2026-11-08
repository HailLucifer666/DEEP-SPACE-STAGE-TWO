# CHANGELOG

All notable changes to STAGE TWO. Format: Keep-a-Changelog-ish, newest first.
Tagged states: see `git tag` (chain: good-s4 → good-gofix → good-feel → good-launch →
good-assets → good-controls → good-rift → good-title → good-arena → good-raiders →
good-pips → good-studio → the dated chain good-2026-11-04…good-2026-11-04-j
(stage 0–1), good-2026-11-05…-f (stages 2–3), good-2026-11-06…-07 (stage 4),
good-2026-11-07-b/-c/-d (stage 5)).

## [Unreleased]

### Stage 6 — experience polish (2026-11-09, branch polish/stage6-experience; merge + tag pending the player's playtest sign-off)
The owner's four experience complaints, audited by a three-member council (8 CRITICAL
plan findings folded in) and fixed as five red-first story cards. flow-check 190 →
**255**; build 4.41 → 4.70 MB (9 CC0 samples); boot faster (221–1086 ms observed).
Docs: `production/polish/` (audits + polish-plan), `design/gdd/stage-6-experience.md`
(supersession record), `one-shot-work/stage-6/GATE.md`, smoke
`production/qa/smoke-2026-11-09-stage6.md`.
- **T1 title/UX pro pass** — inline SVG favicon (was: none); dev chip reworded
  player-appropriate; controls hint → two-column block; pause card gains
  [ RESUME ]/[ SOUND ] pills **with the cursor-restore precondition** (pause never
  changed phase, so `cursor:none` made any button invisible — mutation-proved);
  death/victory cards (the most-seen screens) styled; RECORD-0 flash suppressed
  until the store warms (observer assert via a one-time
  `Page.addScriptToEvaluateOnNewDocument` capability).
- **W1 aim overhaul** — the root cause was structural: the reticle rides the pointer
  while bolts fly along the nose (~screen center); sight and bullets agreed only
  dead-center. Fix: (a) a **gun pipper** that renders only while it diverges from the
  reticle and self-hides when the nose catches up; (b) **auto-lock** — T toggle,
  default ON, persisted on the reserved store surface: ≤6° spawn bias toward the
  locked target for stream bolts only (charged shot stays the manual-aim reward; no
  homing; lead stays manual), hysteresis acquire 6°/hold 10°, behind-camera never
  locks, **boss excluded by design** (a 6° cone at boss range lands inside the ~2°
  weak-point zone — it would automate the ×3 skill the fight exists to test),
  fan+bias sum capped at the 10° retain cone (unreachable-proof, documented).
  Keystone: a **fire-path baseline assert** drives a REAL fired bolt through
  `spawnBolt` — the first such chain; every prior probe bypassed that function, so a
  defective bias used to be structurally invisible to the battery. dep-check gains
  the `aim-assist ↚ combat` import-direction rule.
- **H1 HUD rebuild** — dedicated boss HP **bar** (fed from `BOSS.state()`; the text
  line left `#hud-bars` via SANCTIONED assert rewrites with dated provenance:
  flow-check boss-line asserts, the harness sampling, `probes.js` BP.hud); labeled
  HULL/SHIELD/BOOST meters (same values, same change-gate); "WAVE n" banner on the
  `#combat-online` grammar; kill-only ~150 ms hit markers (6 real non-kill hits
  proven not to mark); the honesty surface `combatState().pipper`; drain extensions
  verified on pad re-entry. No clip-path anywhere new (protects the pip-drained
  counter). Boss.js untouched — the "never render BOSS 0% while dying" contract is
  now asserted.
- **A1 audio overhaul** — 9 Kenney Sci-Fi Sounds (CC0, 201 KB raw) inlined as
  data URLs with LAZY decode (zero audio work before the title mark); the CREDITS.md
  handoff executed minus its music loop (dropped by the recorded size decision);
  sfx/music buses, per-voice StereoPanner + distance attenuation (1.0 → 0.2 floor at
  45 u), voice cap 24 + per-event rate limits, the defaults-configured limiter
  replaced by a deliberately configured compressor (−18 dB / 4:1 / 0.25 s);
  console-silent synth fallback with probe-visible status; the silent moments got
  voices (boss-spawn stinger, victory jingle — recorded as an orchestrator call vs
  the story-014 freeze, UI clicks, gunner fire); music: pads kept, a sparse
  A-minor-pentatonic pluck-arp + hats-only layer added via lookahead scheduling
  riding the existing leak-net contract; TD-015's fault injection moved into the
  sequencer build path (stays non-vacuous). New probe surfaces `?audioProbe=1` /
  `?sfxFault=1`.

### Stage 5 — ship prep (2026-11-07, tags good-2026-11-07-b…good-2026-11-07-c)
- **story-020 settings persistence** — the mute choice survives a reload through the
  existing guarded store: `writeMuted`/`readMuted` mirror the highscore pair (lazy
  probe — no storage touch before the title mark, corrupt-reads-unmuted, honest warn
  on a refused write); `setMuted` persists at the single choke point (M key + sound
  button covered by construction); `restoreMuted` applies in the boot warm block
  without rewriting, and its live-context branch is the documented fallback for a
  gesture that beats the warm block during GLB load. Red-first: 181/7 on the
  unmodified build; mutations A–D each red for the stated mechanism. flow-check
  170 → 188. Reviews: spec COMPLIANT (4 deviations adjudicated legitimate), quality
  CONCERNS → APPROVE (the fix was comment-truth: the gesture-race fallback named
  load-bearing instead of deletable-as-dead-code).
- **Stage-5 riders** (the stage-4 checkpoint's working defaults, player-approved
  2026-11-07):
  - *Rider A — flake-budget policy executed*: drop-rate band [11,25] → [9,28] (exact
    binomial coverage 95.05% → 99.14%), kind-split χ²(2) 5.991 → 9.210 (99%);
    OVERDRIVE bands KEPT with the deterministic-bounds derivation recorded beside the
    asserts (in-regime [8,11] burst / [7,9] boss — nothing widened without arithmetic;
    independently re-verified in review); both recorded mutations re-run RED;
    joint false-red ≈14% → ≈3%.
  - *Rider B — the E.lastRoll diagnostic gated*: the merge-halt per-spawn record now
    builds only under `?balanceProbe=1` (self-read flag — the reverse import is a
    cycle); production spawns allocate nothing; the balance drive is byte-identical
    with the flag on (mechanism gates green, mismatches 0/50).
  - *Rider C — GDD §8.5 re-worded*: the discoverability item now measures hint
    comprehension (the shipped hint bar pre-empts unprompted discovery by design —
    the stage-4 ruling); doc-only, hint text untouched.
  - *Rider D — M-key label staleness fixed* (pre-existing: `input.js` KeyM never
    refreshed the sound button — witnessed in story-020's transcripts, ruled a
    rider-sized follow-up by spec review). flow-check 188 → 190.
- **README.md** — portfolio framing for an interview reviewer: play/build/test
  instructions (including the `EDGE` override for the stale harness Edge pin),
  architecture summary, design decisions, honest known limitations, process-evidence
  map. GitHub Pages is the chosen host (deploy is a separate owner-approved step).
- **Stage-5 close** — smoke record `production/qa/smoke-2026-11-07-stage5.md`;
  GATE.md: PASS (machine gates) — ship checkpoint pending (deploy go, TD-007, TD-08,
  the owed look/feel verdicts).

### Stage 4 — balance + telemetry (2026-11-06/07, tags good-2026-11-06…good-2026-11-07)
- **R-c main.js refactor (TD-003 closed)** — main.js 500→255 lines: the UI banner moved to
  `src/hud.js`, the ROCKET banner to `src/rocket.js` (both verbatim, call-time ctx getters,
  live-bound spinRig), boot() decomposed into three ≤50-line helpers. Bonus: the branch
  exposed a latent master crash — pressing N on the title threw a TypeError (`ctx.activeFix`
  was never wired); fixed with a red-proven regression assert (flow-check 114 → 115).
- **story-018 charged shot + pickups** — the fire trigger gains a second stage: the LMB-only
  stream fires exactly as shipped below `T_CHARGE = 0.6 s` of continuous hold, then
  suppresses while the charge fills (whine starts), and release fires ONE heavy bolt
  (`CHARGE_DAMAGE = 6` vs the regular bolt's 1; weak-point 18 via the carried-damage param —
  boss.js untouched). Cancels on death/pause/combat-exit (the release-during-pause ordering
  was caught by review and fixed red-first). Enemies drop SPREAD/OVERDRIVE/SHIELD at 18%
  (8 s life, 2 s blink, full-3D pickup radius 1.4, refresh-not-stack, concurrent kinds) via
  the new `src/powerups.js`; charge ring + effect chips in the HUD; 4 synth recipes; controls
  text in both homes. flow-check 115 → 147.
- **story-019 elites + wave tables + telemetry + boss reward** — raiders gain elite variants
  from wave 4 (0.22 per spawn: HP ×3, speed ×1.15, scale ×1.35, amber 0xffa02f, score ×2
  shot-down only, unconditional per-spawn reset); waves 1–5 get authored deterministic
  kind splits whose totals equal the derived curve exactly (boundary asserted both ways);
  the 12-group event-driven telemetry accumulator (kills/hits/damage-by-source/score-by-
  source/waveTimes/pickups) rides `combatState()`; defeating the boss awards the LOCKED
  1000 flat (latched exactly-once, card reads it same-frame, high-score write-through).
  flow-check 147 → 170.
- **The merge-halt finding** — the elite-rate band reded 3× across merge batteries (18–20
  elites per 50 rolls vs p = 0.22). Per-roll instrumentation proved the game mechanism exact
  (350/350 draw↔flag agreement) and the ENVIRONMENT's Math.random delivers run-level
  clustered batches (a captured 3.4σ draw batch; root cause open, recorded). The
  distribution gate was replaced by mechanism gates batching cannot defeat + an exact 99.9%
  sanity band; mutation discipline re-verified. Flake-budget policy (tighten remaining 95%
  bands to 99%+; joint flake ≈14% → ≈4%) = stage-close decision.
- **Stage-4 review** (per-story chains ×4 rounds + independent whole-stage pass): gate-ready
  on substance; bookkeeping closes at the gate (TD-003 register row, LEDGER W3, story-019 AC
  amended to the shipped gate); decision items recorded (hint-bar text vs the discoverability
  playtest item; E.lastRoll diagnostic allocation; elite hitbox wiring DEFERRED to the
  evidence-driven balance pass this stage's telemetry enables).

### Stage 3 — full 3D flight (2026-11-05, tags good-2026-11-05-c…good-2026-11-05-f)
- **story-015 pitch + drift** — the ship leaves the plane: `forward()` goes 3D
  `(sin h·cos φ, sin φ, cos h·cos φ)` (the keystone — velocity, bolts, camera and probes
  inherit the vertical axis from one change); pitch on pointer-Y (direct) + R/F keys, ±72°
  envelope (no loops, by design — camera up-vector safety); drift = persistent velocity
  realigning to the nose (`ALIGN_RATE 4.5/s`, ≈26° slip at full turn; sustained-turn radius
  TIGHTENS to ≈6.9 u — GDD §4.3 errata, designer-adjudicated from implementation
  measurement); chase-cam look-target un-pinned from ARENA_Y; raider altitude-follow + all
  three XZ-only collision scans → full-3D (the anti-camp fix); temporary altitude-band
  scaffold (retired by 016); `?pitchProbe=1`. flow-check 76 → 99.
- **story-016 spherical arena** — the flat disc becomes a soft sphere at O=(0,18,0), same
  numbers (R_SOFT 60 / R_HARD 80, the load-bearing 3 u/s bleed floor, tangential preserved,
  hard clamp); band scaffold retired (flagged); boundary probes re-derived r → r3 (flagged);
  boss dashTarget clamped inside the shell — the review chain caught the operator-order bug
  (measure-after-mutate was a silent no-op at the pole) and fixed it with a pole-park
  regression assert; probes extracted to `src/probes.js` (combat.js 1100 → 614); riders
  landed (camera down-ceiling, rate-consistency pitch windows, raider separation dy).
  flow-check 99 → 106.
- **story-017 world goes 3D** — combat dressing goes volumetric: ambient InstancedMesh
  (120 rocks, deterministic seed, shell 25-75 u, one draw call, slow group rotation) + faint
  additive boundary shell (rim-ring material grammar, ≤ 0.18 opacity, 3D proximity driver),
  both prepare-once baseline members; `?dressingProbe=1`; ZERO src/launch.js changes (cruise
  untouched). flow-check 106 → 114.
- **Stage-3 review** (per-story chains + independent stage pass): story-016's chain caught
  a CRITICAL clamp bug AND a falsified mutation record — both re-proven with true red-first
  records. One rejected dispatch left an unrestored mutation in the tree; the merged-master
  battery caught it (112/2), the leftovers were inspected + discarded, 114/114 re-verified.
  Residual debt tabled in `one-shot-work/stage-3/PROGRESS.md` (R-c main.js refactor is
  mandatory before the next main.js line; mirrored arena consts defer on any R_HARD retune).

### Stage 2 — boss + victory, the take-home P0 (2026-11-04/05, tags good-2026-11-04-h…good-2026-11-05-b)
- **story-011 main.js split (TD-003 closed)** — 791→500 lines: STORE/PHASES/INPUT/LOOP into
  `src/store.js`/`phases.js`/`input.js`/`loop.js`, ONE late-bound ctx object, zero behavior
  change (28/28 + full probe set green on branch and merged master); `tools/dep-check.mjs`
  enforces acyclic imports + the 500-line composition root mechanically.
- **story-012 Vi3W drone** — third enemy (ring+core+fins, additive neon), orbiting diver with
  FULL-3D steering (y first-class, no arena constant baked in — Stage 3 retunes, not rewrites);
  build-time GLB swap (`build/drone.glb` → `__DRONE_B64`, same quantize pipeline), BOTH paths
  machine-proven (glb 1 part / proc 5 parts); `?droneProbe=1` proves yRange > 1 u + telegraph.
- **story-013 boss fight** — the sector warden: orbit+volley → charge (0.8 s telegraph, 10 u
  overshoot — no ram-bait full stops) → rage; weak-point core node 3× damage (proven 9 vs 3
  dmg from equal 3-bolt streams); slow-mo death cinematic; BOSS HP line in the change-gated
  HUD bars; spawns once after wave 5. TD-013 closed (guarded render path, honest `post:
  'direct'` degrade), TD-014 closed (stale #tele cleared on REPLAY), TD-015 closed (musicTo
  can never abort a phase transition).
- **story-014 victory card** — `bossDefeated` lands the win phase exactly once (event-path
  trigger, mutually exclusive with gameover by the `!C.dead` guard); per-fight combat clock
  (M:SS on the card); `#victory` overlay in the gameover card discipline with the win-cyan
  accent; REPLAY → pad, second run clean. Found-defect fix: edge pips drained on REPLAY
  (pre-existing leak, death card included).
- **Stage-2 review** (independent, 0 CRITICAL / 2 IMPORTANT / 4 ADVISORY / 5 NIT — all
  dispositioned): bossDefeated re-fire latched, page-level CONSOLE gates added to flow-check
  (the final gate had only ever measured the last page), victory-score freeze fixed,
  composer-latch guards completed, zero-vector dash made unrepresentable. flow-check now
  **76 asserts** (was 28 at stage start).

### Stage 1 — the impression pass (2026-11-04, tags good-2026-11-04…good-2026-11-04-f+)
- **story-007 lazy storage + GLB quantize** — boot to title **513 ms headed** (was 3.2–5.4 s):
  the localStorage capability probe no longer runs at module eval (it made Chromium build its
  storage DB synchronously on cold profiles — 3–5 s of black screen every first-time player);
  GLBs weld+dedup+prune+quantize in the build (2.97→2.58 MB, index.html 4.66→4.32 MB).
- **story-008 bloom + title framing** — EffectComposer/UnrealBloomPass wired through both
  render paths (never-crash fallback), DPR ladder drops bloom first; the hero ship now sits
  below the title text instead of hiding behind it. Player-verified.
- **story-009 music bed + SFX** — procedural title/combat pads (musicBag on the loopStart
  contract), overlapping crossfades via musicTo, musicEvict replacing loopsStopAll at all four
  engine-teardown sites, boost ducking, low-hull alarm (880 Hz, re-arm hysteresis), proximity
  tick. Probe surfaces: musicState/loopsCount/alarmActive. Player-verified.
- **story-010 SPD readout + sag verdict** — change-gated speed line in the combat HUD (r2 UX
  advisory closed); gameover fps sag measured headed: artifact (143.2 vs 144.0 fps at vsync) —
  pinned, no fix. r2 advisory closed with data.
- **story-006 boot measurement** — window.__BOOT marks + headed boot-marks harness; the
  "55–60 s GLB decode" premise corrected (GLBs: ~0.18 s; real cost was storage + bundle parse).
- Stage 1 review: independent pass — 1 IMPORTANT (dishonest highscore-write catch) fixed
  same-day; 3 advisories accepted into the tech-debt register (TD-013/014/015) with named fixes.

### Added
- Claude-Code-Game-Studios framework (`.claude/`: 74 skills, 49 agents, docs+templates,
  hooks, rules; `project.yaml` rigor=minimal, automation=guided). 2026-11-03.

### Prior rounds (detail in git log)
- good-pips: edge threat pips, kill shake. good-raiders: ship-shaped raiders — gunners
  (orbit + dodgeable bolts) + rammers, separation, score by kind. good-arena: arena 3×
  (80), spawn ring 55, speed 17. good-title: pro start screen (chrome, panels, arm-confirm
  record reset). good-rift: rift→warp→logo transition (shader tear, FOV kick, gates).
  good-controls: Space=boost, LMB fire, flowing field, explosion-pool tick fix.
  good-assets: Orbitron/Rajdhani fonts (OFL). good-launch: cinematic deep-space cruise,
  Vi3W stage-one derelicts. good-feel: cursor:none, tracking reticle, DPR auto-degrade.
  good-gofix: death-card response fixes.
