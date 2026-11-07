# STAGE-5 RIDERS — evidence report (riders A-D, branch `stage5-riders`)

Run 2026-11-07 by the build team's gameplay programmer. Base: master 4ae99de (the docs-only
commit on top of the 93062ed code state; the branch holds the identical code). Four riders,
one commit per rider, in the dispatched order. Master untouched, no merge, no tag — the
orchestrator owns the merge.

| rider | commit | files | assert count |
|---|---|---|---|
| A — flake policy (99%+ bands) | 5425135 | tools/flow-check.mjs only | 188 (labels/counts unchanged — bands changed, no new assert) |
| B — gate E.lastRoll | 302da5d | src/enemies.js, src/main.js, tools/flow-check.mjs, index.html | 188 → 189 |
| C — GDD §8.5 wording | 3046252 | design/gdd/stage-4-balance.md only | — (doc) |
| D — M-key label refresh | be38213 | src/input.js, tools/flow-check.mjs, index.html | 189 → 190 |

Final battery on the committed tree (be38213): `npm run build` 4.41 MB ·
`node tools/dep-check.mjs` PASS (main.js 263/500) · `node tools/flow-check.mjs`
**190 passed, 0 failed, CONSOLE [] on every page** · `node tools/boot-marks.mjs` in band
(MODULE → TITLE 719 ms, TRUE wait 2944 ms).

Environment note: every flow-check/boot-marks run in this stage used the override
`EDGE="C:/Program Files (x86)/Microsoft/EdgeCore/157.0.4341.42/msedge.exe"` — see Known
limitations.

---

## Baseline

`flow-baseline-master.txt`: flow-check on the unmodified master build (branch point) —
**188 passed, 0 failed**. The environment was green before any edit; all later reds are
attributable to their recorded cause, not ambient flake.

---

## Rider A — flake policy: statistical bands to 99%+ (tools/flow-check.mjs ONLY)

Provenance: stage-4 GATE DECISION 1 + story-019 §11 (Option A — every statistical band
≥ 99% per band; the measured joint false-red of the remaining 95% bands was ~14%/run;
target joint ≈ 3%). Player-approved 2026-11-07 (the open checkpoint's working default).

### 1. Drop-rate band (flow-check.mjs L1187 assert, derivation comment L1164-1183)

`[11,25]` → `[9,28]`, re-derived independently from exact binomial pmf sums (n = 100,
p = 0.18; computed offline with node, exact `C(n,k)·p^k·(1-p)^(n-k)` summation):

| interval | coverage |
|---|---|
| [11,25] (old) | 95.05% |
| [9,27] (the recorded exact-quantile band) | 98.71% — NOT sufficient |
| **[9,28] (shipped)** | **99.14%** |
| [8,28] (the alternative) | 99.39% |

[9,28] is the smallest interval clearing 99% that contains the quantile band: the two
one-step extensions are [8,27] = 98.95% (fails; P(X=8) = 0.24%) and [9,28] = 99.14%
(passes; P(X=28) = 0.44%). Tails at the shipped band: P(X ≤ 8) = 0.38%, P(X ≥ 29) = 0.48%
(joint miss 0.86%/run). The arithmetic and the policy provenance are recorded beside the
assert; the block comment (L1133-1141) carries the decision reference. Label updated
("binomial 99% band [9,28]").

### 2. Kind split (flow-check.mjs L1190 assert, comment L1202-1213)

χ²(2) threshold 5.991 (95%) → **9.210** (99%). dof-2 survival S(x) = exp(−x/2):
S(9.21034) = 0.01 exactly; 99.5% would be 10.59663 — NOT used (the policy is 99%).
Label + comment updated. Discrimination boundary recorded honestly in the comment: a gross
skew still reds (all-one-kind reads χ² = 600 ≫ 9.210); a mild 40/30/30 skew reads χ² ≈ 6.0
and is now GREEN by policy — the approved cost of the 95→99 retightening.

### 3. OVERDRIVE bands [8,12] / [7,11] — MECHANICAL quantization bands: UNCHANGED

Re-derived from the fire path's exact mechanism (src/weapons.js `fireTick`: `C.fireT`
decrements first each frame and resets to the FULL interval on fire — no overshoot carry —
so the cadence quantizes to K = ceil(interval/dt) frames per shot; the burst window ends at
the suppression frame m = ceil(T_CHARGE/dt); shots = 1 (the press-frame bolt) +
floor((m−1)/K), all in game time — the drive's PU.t and chargeT accumulate the same dt).
Full derivation tables recorded beside both asserts (L1216-1249 burst, L1287-1300 boss
window). Results:

- Burst (0.6 s): deterministic range over the OBSERVED environment cadence band
  (committed history intervals 0.0667-0.0714 s → dt ≈ 0.0167-0.0238, the 2026-11-06 widen
  record's own basis) is **[8,11] ⊂ [8,12]** — coverage ≥ 99% BY CONSTRUCTION in-regime.
  Absolute honest max 11 (10 gaps × 0.0568 = 0.568 ≤ 0.6; an 11th gap = 0.625 > 0.6 is
  unreachable) — the ceiling never masks a real bug.
- Boss window (0.5 s): deterministic range in-regime **[7,9] ⊂ [7,11]**; absolute honest
  max 9 (8 gaps = 0.454 ≤ 0.5; 9 gaps = 0.511 > 0.5) — the 11 ceiling is pure margin.
- **Change: NOTHING** (rider rule: no widening without arithmetic). The conditions are
  byte-identical; only the labels' rationale text was corrected — the old label claimed the
  band covers "DT_CLAMP stalls", falsified by the derivation (a full dt = 0.05 stall reads
  6 < 8). The correction is recorded in the comment.

Honest caveat, recorded beside the asserts and under Known limitations: a SUSTAINED
≤ 23 fps stall (dt ≥ 0.043 through the whole window — the FRAME-CAP note's ~15 fps class)
reads 6-7 (burst) / 5-6 (boss), outside the bands — but in that same regime the measured
interval reads K·dt ≥ 0.086 > 0.075, so the interval assert (in the same ok(), untouched by
this rider) co-reds: the shot-count band is never the sole discriminator there. A jitter
corner (7 shots with an in-band mean interval) exists in theory and is unbounded by
arithmetic; the recorded population (six burst samples 9,9,9,9,9,8; boss-window samples
7-10) contains zero sub-band observations and no measurement establishes the class at
≥ 1% — hence no widening.

### 4. Elite sanity band [3,21] — UNTOUCHED

Already 99.9% (coverage 99.9116% verified for n = 50, p = 0.22); the mechanism-gate assert
around it is untouched.

### 5. Mutations re-run (each: apply → npm run build → FULL flow-check → git restore → rebuild)

Enumerated set: every recorded mutation whose red assert intersects a bound I changed.
The drop-roll mutation (story-018 recorded mutation 2) reds both changed asserts; the
T_CHARGE mutation (story-018 recorded mutation 1) is the only recorded mutation whose red
set includes the OVERDRIVE shot-count asserts (whose lines the rider touched for the
derivation/label). No dedicated kind-skew mutation is recorded in any story ledger — noted
on the χ² comment; the kind-split red under the drop-roll mutation is threshold-independent
(total < 300).

- **drop-roll** (src/powerups.js maybeDrop → unconditional `return false`): RED
  `drop rate p=0.18 within the binomial 99% band [9,28]` reading `{"kills":100,"drops":0}`
  (0 < 9 — the new low edge holds discrimination) + the same-root kind-split red —
  **186 passed, 2 failed**. Transcript: `flow-mutation-droproll-riderA.txt`.
- **T_CHARGE 0.6 → 0.06** (src/weapons.js): RED both OVERDRIVE shot-count asserts — burst
  `{"suppressAt":0.067,"shots":1,"frameDt":0.0167}`, boss window
  `{"shots":1,"frameDt":0.0199}` (1 ≪ 8 / 1 ≪ 7 — the unchanged bands hold discrimination) +
  the same-root tap/hold reds — **184 passed, 4 failed**. Adjacent keep-passing observed in
  the same run: drop rate `{"kills":100,"drops":15}` inside [9,28] (the band change is
  behavior-neutral on honest rolls) and kind split {98,103,100} green under 9.210.
  Transcript: `flow-mutation-tcharge-riderA.txt`.

Neither mutation went green — no discrimination lost. Battery transcript:
`battery-riderA.txt` (dep-check PASS, flow-check 188/0, boot-marks title 1409 ms / TRUE
wait 5021 ms in band).

---

## Rider B — gate the E.lastRoll diagnostic (src/enemies.js + main.js + flow-check)

Provenance: stage-4 GATE DECISION 3 + stage-4 PROGRESS finding 6 — the merge-halt
diagnostic allocated a per-spawn record unconditionally in production.

- `src/enemies.js` L43-53: `const BALANCE_DIAG = new URLSearchParams(location.search)
  .get('balanceProbe') === '1';` — read DIRECTLY here, with the split documented (probes-
  balance owns the drive; enemies reads the same flag for the diagnostic capture only).
  The import direction is forced: probes-balance.js imports enemies.js, so enemies cannot
  import probes-balance (cycle — dep-check would fail).
- `src/enemies.js` L208: the `E.lastRoll = {...}` RECORD is now `if (BALANCE_DIAG) …`. The
  `eliteDraw` capture stays unconditional — it IS the roll the stamp consumes. Flag off:
  E.lastRoll stays null through every spawn; `lastRollProbe()` returns null. Flag on:
  byte-identical to pre-rider behavior.
- `src/main.js` L11 (import) + L222 (`get lastRoll() { return ENEMIES.lastRollProbe(); }`
  in the `__stage2` literal — the mutedRaw precedent). main.js 263/500. New main→enemies
  edge acyclic (enemies imports only stage-two-lib + pool) — dep-check PASS.

**RED-FIRST** (2026-11-07, rider A build @ 5425135 — product code byte-identical to
master): assert written first, seen RED — `flagOffLastRoll:"absent", flagOnDraws:50` —
**188 passed, 1 failed** (`flow-red-riderB.txt`). On the ungated build the harness surface
did not exist (undefined ≠ null) and the record populated unconditionally (the flag-on half
read 50 recorded draws). **GREEN** after the gate + getter: `flagOffLastRoll:null,
flagOnDraws:50` — **189 passed, 0 failed** (`flow-green-riderB.txt`); the balance drive's
existing mechanism-gate assert (mismatches = 0) stayed green — the regression proof that
the flag-on path is unchanged.

**MUTATION** (gate removed — `if (true || BALANCE_DIAG)`, record unconditional again):
apply → build → FULL flow-check → **188 passed, 1 failed**, the flag-off page reads a
POPULATED record (`{"draw":null,"rolled":false,"wave":1,"skipped":"wave",
"sib":{...}}`) — the exact production allocation the rider removes
(`flow-mutation-lastroll-gate-removed.txt`). Restored → rebuilt.

Process note recorded honestly: the restore after this mutation used
`git checkout -- src/enemies.js`, which (the fix not yet being committed) also wiped the
rider B implementation; it was re-applied and the full battery re-run on the exact
committed tree (`battery-riderB.txt`: dep-check PASS 263/500, flow-check 189/0, boot-marks
title 246 ms / TRUE wait 3876 ms in band). The red-first and mutation transcripts were
produced by builds that verifiably contained (respectively) no gate and no gate+mutation —
their readings are mechanism-distinct and unaffected.

---

## Rider C — GDD §8.5 wording amendment (design/gdd/stage-4-balance.md — DOC ONLY)

Provenance: stage-4 GATE DECISION 2 working default + stage-4 PROGRESS finding 3 — the hint
bar announces the charge shot, pre-empting §8.5's "discoverable without instructions" item
AS WRITTEN; the player's ruling = keep the hint, re-word the item.

- §8.5 item 1 (design/gdd/stage-4-balance.md L574-580) replaced: "Charged shot discoverable
  without instructions: within a new player's first two waves they hold past the threshold
  at least once unprompted (the whine is the teacher — §3.1)." → the item now measures HINT
  COMPREHENSION: "Charged shot executes from the hint (hint comprehension): after reading
  the hint bar's charge line, the player executes at least one full charge-release within
  their first two waves (the whine confirming the hold — §3.1)." + the dated provenance
  note ("Re-worded 2026-11-07 per the stage-4 checkpoint ruling — the shipped hint bar
  pre-empts unprompted discovery by design; what the playtest measures is whether the hint
  translates into the behavior, and whether suppression reads as charging (item 2) and
  chips stay legible (item 3).").
- Items 2-5 byte-identical (diff: 1 file, +7/−2 — verified with `git diff`).
- The shipped hint text stays byte-identical: src/hud.js untouched (rider C's commit
  contains only the GDD file).

---

## Rider D — M-key label refresh (src/input.js + flow-check)

Provenance: story-020 spec-review ruling (2026-11-07) — the defect is PRE-EXISTING
(input.js's combat-branch KeyM line never refreshed the button label; only the btn-sound
click path (main.js) and the boot warm block did), ruled out of story-020's locked scope,
rider-sized. Pre-existing witness in story-020's own green transcript:
`production/qa/evidence/story-020-settings-persistence/flow-green-final.txt` L173 —
in-session `m:true, label "[ SOUND: ON ]"`.

- `src/input.js` L8: `import { refreshSoundButton } from './hud.js';` — the new input→hud
  edge is acyclic (hud.js imports only store.js + audio.js); dep-check PASS proves it.
- `src/input.js` L47: `if (e.code === 'KeyM') { setMuted(!isMuted());
  refreshSoundButton(); }` — the M path now refreshes the label like the click path.

**RED-FIRST** (2026-11-07, rider C build @ 3046252 — input.js byte-identical to master):
assert written first ("M press flips the label IN-SESSION (no reload)"), seen RED —
`m:true, label "[ SOUND: ON ]"` — **189 passed, 1 failed** (`flow-red-riderD.txt`), the
exact pre-existing defect. **GREEN** after the fix: `m:true, label "[ SOUND: OFF ]"` —
**190 passed, 0 failed** (`flow-green-riderD.txt`); the story-020 persistence asserts
(including the warm-restore label reads) all stayed green.

**MUTATION** (refreshSoundButton() call removed from the KeyM branch): apply → build →
FULL flow-check → **189 passed, 1 failed**, `m:true, label "[ SOUND: ON ]"`
(`flow-mutation-mkey-refresh-removed.txt`). Restored by re-applying the fix (NOT git
checkout — the fix was uncommitted), rebuilt.

Battery on the committed tree (`battery-riderD.txt`): dep-check PASS 263/500, flow-check
190/0, boot-marks title 719 ms / TRUE wait 2944 ms in band.

---

## Battery record (with the EDGE env var)

Every run used `export EDGE="C:/Program Files (x86)/Microsoft/EdgeCore/157.0.4341.42/msedge.exe"`.

| run | transcript | result |
|---|---|---|
| baseline (master, unmodified harness) | flow-baseline-master.txt | flow-check 188/0 |
| rider A battery | battery-riderA.txt | dep-check PASS · 188/0 · boot-marks 1409 ms / 5021 ms |
| rider A mutation: drop roll | flow-mutation-droproll-riderA.txt | 186/2 (the two changed asserts red) |
| rider A mutation: T_CHARGE | flow-mutation-tcharge-riderA.txt | 184/4 (both OVERDRIVE asserts red) |
| rider B red-first | flow-red-riderB.txt | 188/1 (rider B assert red) |
| rider B green | flow-green-riderB.txt | 189/0 |
| rider B mutation: gate removed | flow-mutation-lastroll-gate-removed.txt | 188/1 (populated record on the flag-off page) |
| rider B battery (committed tree) | battery-riderB.txt | dep-check PASS · 189/0 · boot-marks 246 ms / 3876 ms |
| rider D red-first | flow-red-riderD.txt | 189/1 (label stuck ON while muted) |
| rider D green | flow-green-riderD.txt | 190/0 |
| rider D mutation: refresh removed | flow-mutation-mkey-refresh-removed.txt | 189/1 (label stuck ON while muted) |
| rider D battery (committed tree) | battery-riderD.txt | dep-check PASS · 190/0 · boot-marks 719 ms / 2944 ms |

CONSOLE [] held on every page of every flow-check run (the CONSOLE asserts are part of the
count; zero failures across all green runs).

## Known limitations

1. **Edge-binary drift hazard (environment, NOT fixed here — out of scope, backlog
   recorded)**: tools/flow-check.mjs and tools/boot-marks.mjs hardcode a stale Edge default
   (EdgeCore\156.0.4314.58 — not installed). Every run MUST override:
   `export EDGE="C:/Program Files (x86)/Microsoft/EdgeCore/157.0.4341.42/msedge.exe"`.
   Without it both tools fail to launch a browser. The hardcoded default was deliberately
   not fixed in this task (the brief marks it out of scope).
2. **OVERDRIVE bands' residual stall class**: the derivation (rider A.3) bounds the bands
   BY CONSTRUCTION over the observed cadence regime; a sustained ≤ 23 fps stall reads
   6-7 / 5-6 — co-red by the interval band in the same ok() when sustained, and a jitter
   corner (sub-band count with an in-band mean interval) is theoretically possible and
   unbounded by arithmetic. Recorded population: zero sub-band observations; frequency
   unmeasured. If a future run reds an OVERDRIVE count assert, read frameDt + interval
   from the report before treating it as a product bug.
3. **Flake policy discrimination boundary (approved cost)**: the 99% bands accept honest
   rolls the 95% bands caught — drop counts 9-10 / 26-28 (previously outside [11,25]) and
   kind skews with χ² in (5.991, 9.210] (e.g. a 40/30/30 split over 300 drops) now pass.
   Gross skews still red. This is the player-approved Option A trade (joint false-red
   ~14%/run → ≈ 3%).
4. **Rider B flag-off red-first reading**: on the pre-fix build the harness surface did
   not exist, so the red read `absent` rather than a populated record; the flag-on half of
   the same assert (50 recorded draws) proved the unconditional population, and the
   gate-removal mutation reds with the populated record itself. The three states
   (absent / null / populated) are distinguishable in the transcripts.
5. **Flow-check transcripts for rider A's droproll mutation, rider B and rider D runs**
   were captured through a FAIL/summary grep (the red lines + pass/fail counts are
   complete; full PASS listings were not retained for those runs). The tcharge mutation,
   both batteries and the baseline are full transcripts.
6. Pre-existing defects observed, NOT fixed (out of scope): none new. The Edge default
   (limitation 1) is the only environment defect encountered.
