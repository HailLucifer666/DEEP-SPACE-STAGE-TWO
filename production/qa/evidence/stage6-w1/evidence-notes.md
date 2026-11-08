# stage6-w1 — evidence notes (aim overhaul: fire-path baseline, pipper, auto-lock)

Story: `production/polish/polish-plan.md` W1 · spec: `production/polish/ux-audit.md` F1 ·
laws: `production/polish/scope.md`. Implementer: gameplay-programmer, branch
`polish/stage6-experience`, 2026-11-08.

## Run records (raw transcripts in this directory)

| file | what it shows |
|---|---|
| `flow-red-w1.txt` | RED-FIRST: full suite on the feature-less build (probe infrastructure only — no aim-assist.js, no bias, no T, no pipper/bracket, combatState without `.lock`/`.lockTarget`). 207 passed / 25 failed — the 25 failures are exactly the new W1 asserts, each for its absence reason (lock surface undefined, elements absent, KeyT a no-op, biasDeg 0). |
| `flow-green-w1.txt` | GREEN after the feature: **232 passed / 0 failed** (201 pre-existing + 31 new). biasDeg measured **6.00** at the retained 8.5° target (the 6° cap binding exactly); fan capture: near/center bolts converge to the bolt-relative 4.86°, far bolt clamped to exactly 0° off the nose; dead-target drops the lock; boss never locks; pipper render/hide/re-hide; bracket on-lock/hidden; T + persistence battery incl. corrupt 'garbage'/'2' → OFF + byte-identical survival. |
| `flow-mutation-biasclamp.txt` | MUTATION (a) — `Math.min(BIAS_MAX_RAD, ang)` → `ang`: 229/3. RED `bias cap` (biasDeg **10.32** — the unclamped bolt rotates the full angle onto the retained target) + RED `far fan bolt does NOT fully converge` (maxAngleToTarget **0.86** < 3 — every captured dir reads the target dir exactly). The dead-ahead baseline asserts stayed green BY CONSTRUCTION (zero angle ⇒ zero rotation). One co-occurring environmental OVERDRIVE-interval flake (0.0778 > 0.075 at frameDt 0.0207 — see the flake note below). |
| `flow-mutation-cone180.txt` | MUTATION (b) — `ACQUIRE_DEG 6 → 180`: 231/1. RED `outside-cone target never locks` ALONE (the 20° parked target acquires; its fired bolt reads 6° = the capped bias, consistent). |
| `boot-marks-w1.txt` | headed boot marks: MODULE → TITLE **585 ms**, TRUE wait **6253 ms** (inside the story-020 green band 6,078-6,535 ms — no boot regression), CONSOLE []. |
| `combat-probe-w1.txt` | 6/6 PASS (pause freeze/resume/audio, mute, holdfire with real biased bolts, honest values). |

## Green-by-design — the fire-path baseline (W1 card item 1, required order)

The two baseline asserts (`real fired bolt flies along forward`, dirDeg ≤ 1.1°; `the real fired
bolt kills the seeded dead-ahead target`) ran GREEN in `flow-red-w1.txt` — i.e. on the build
WITHOUT the feature. That is the point of the card: the invariant the bias must not break was
proven on the unbiased build first, and it stayed green after the feature (zero lock angle ⇒
zero bias rotation). Every pre-W1 probe bypassed `spawnBolt`; this is the first assert chain
that reads `b.userData.dir` of a bolt that came through the REAL trigger: CDP
`Input.dispatchMouseEvent` mousePressed/mouseReleased → `input.js` onPointerDown → `input.fire`
→ `fireTick` → `spawnStreamShot` → `spawnBolt` → `boltsTick`.

## The fan+bias sum clamp — the card's "decide and DOCUMENT"

Bias rotation per bolt is capped at **6°** (BIAS_MAX_DEG). The SPREAD fan is ±6°
(SPREAD_ARC, weapons.js). The **stated sum max is 10° from nose-forward — the lock retain
cone**: both the pre-bias dir (≤6°, fan) and the locked-target dir (≤10°, retain) lie in the
geodesically-convex spherical cap of radius 10° around nose-forward (caps ≤ 90° are convex),
and the biased dir lies ON the geodesic segment between them — so the final dir can never
exceed 10° off the nose, inside the naive 6°+6°=12° ceiling with margin. Measured: center-bolt
stage reads exactly 6.0 (band [5.5, 6.3]); fresh-acquire fan stage reads ≤ 4.86° for every
bolt. The charged release is never biased (manual-aim reward); boltsTick never rewrites dir
(no homing — bias is final at spawn).

## Persistence semantics (store.js LOCK_KEY, the muted-pair mirror)

Default ON (the audit's opt-out-able assist). Canonical-value clamp: an UNWRITTEN key boots
ON; ANY stored value that is not `'1'` reads OFF — the user's own `'0'`, and corrupt seeds
`'garbage'`/`'2'` degrade to manual aim (the conservative fallback). Byte-identical survival
asserted (restore reads, never rewrites). `?lock=0` forces the lock OFF for a whole page (T
no-ops) — applied to the pitchProbe / chargeProbe / powerupProbe / balanceProbe URLs so every
pre-existing band sees unbiased bolts; all stayed green.

## Harness findings during bring-up (recorded, never quiet edits)

1. Bolt-pool leftover pollution: a drive stage's late hold bolts were still alive at the next
   stage transition and the fresh seen-set captured them as the stage's "first bolt" — fixed
   pre-green with `C.bolts.clear()` at every stage transition (probes-fire.js).
2. Overwrite recording: the stage-2 capture overwrote `biasDeg` on every newly seen bolt, so
   the post-kill unbiased shots masked the biased first shot (read 0 while the bolt
   demonstrably converged — it killed the 8.5°-parked target, which an unbiased bolt cannot).
   Fixed pre-green: first capture only.
3. OVERDRIVE interval flake (pre-existing band, not a W1 assert): frameDt drifted
   0.0187 (T1 green) → 0.0199 (red run) → 0.0206 (green run 1) and the measured interval
   0.0786 crossed the 0.075 edge once; it passed in green run 2/3 and under mutation (b).
   Headless timing noise, no fire-cadence code touched by W1 (the bias path is a 4-check
   early return at `?lock=0`). Recorded per the house flake policy — no band widened.
4. The rocket's nose sits at rocket-local (0,1,0) scaled ≈1.6 → the bolt-relative target
   angles are ~10.32°/4.86° at the 8.5°/4° seats (the drive's seat math assumed +1.0). The
   assert bands were chosen rotation-invariant (≥3° / ≤6.3°), so no band changed; the numbers
   are recorded here and in the flow-check block comment.

## Deliberately not done

- No retarget-by-distance tie-break beyond nearest-ANGLE (the aim metric) — the card specifies
  angle cones only.
- No lock for the charged release (the manual-aim reward — out of scope by the card).
- No new audio cue for the toggle (not in the card).
- `src/boss.js`, `src/audio.js`, the HUD bars writer untouched, per the brief.
