# UX Audit — Stage 6 Experience Polish (STAGE TWO)

Owner-approved plan; every file:line spot-checked on disk 2026-11-08 (see Verification
appendix — one numeric correction). Findings ranked by player impact. Framing uses the
project's own language: "controls that FEEL right" and "smooth, never stuck, obvious
controls" (`design/game-brief.md` MVP 4 + closing, L34), honest HUD (MVP 6, L20), the
die→card→replay core loop (L8, L12), SDT Competence/Discovery (`design/gdd/full-3d-flight.md`
§2), the story-004 contract "the ship flies where the nose points", and the shipped model
"the reticle stays a steering reference, not an aim point" (`full-3d-flight.md:390-393`).

---

## F1 — AIM IS THE #1 UX DEFECT: the crosshair and the bullets disagree

**Evidence**
- The reticle rides the raw pointer: `src/combat.js:578-586`.
- Bolts fire along the ship's nose: `spawnBolt` defaults the bolt dir to `forward()`
  (`src/weapons.js:89`); `forward()` is built from accumulated heading/pitch
  (`src/combat.js:213-219`); the chase cam `lookAt(pos + forward·4)` projects the nose
  path to ≈screen center (`src/combat.js:523`).
- The pointer never aims: its offset only commands turn RATE behind a 0.08 NDC deadzone
  (`src/combat.js:242-244`). Reticle and bolt path coincide only when the pointer is
  dead-center.
- No lead aid: bolts 42 u/s (`src/weapons.js:46`) against gunners holding 16-24 u
  (`src/enemies.js:185`) crossing at up to ~9.7 u/s tangential (wave-speed cap 12,
  `src/enemies.js:57` × 0.7 orbit term × 1.15 elite, `src/enemies.js:287` + `:38`;
  the radial term peaks ~13.8, `:286`) and rammers diving at ~15.9 u/s
  (`src/enemies.js:306`), against a kill sphere of r ≈ 1.05 u (dx²+dy²+dz² < 1.1,
  `src/weapons.js:176`). At 20 u that is ≈13° of mandatory manual lead.
- Misses are silent: feedback exists only on hits — explosion + shake + beep on kill
  (`src/weapons.js:179,196-197`). A miss returns nothing the player can correct from.

**Why it matters** — Competence (SDT) is the loop's engine and it is blocked: a player
who does everything the reticle asks still misses, and the silence of a miss means the
skill (3D lead) can never be self-taught. In flow terms the anxiety channel wins: the
unaided skill floor sits above what the game teaches. The shipped design already
documents the two-surface truth — reticle = steering reference, nose = bullet path
(`full-3d-flight.md:390-393`) — but renders it nowhere; the pipper makes that documented
truth visible instead of leaving it as a hidden gotcha. The soft lock is the on-ramp:
opt-out-able, and the charged shot stays manual so aim mastery keeps its home.

**Proposed fix (audit-revised)**
- (a) **Gun pipper** — small cyan sight marker at the nose-forward projection. Renders
  ONLY while diverging from the reticle past a threshold; self-hides when aligned. It
  teaches "your bolts go THERE," then gets out of the way.
- (b) **Auto-lock toggle, ON by default** — T in combat, persisted (the store.js settings
  surface; MUTED_KEY precedent `src/store.js:43-55`). Soft magnetism: stream bolts bias
  ≤6° toward the locked target AT SPAWN ONLY — no homing; bolts stay ballistic
  (`boltsTick` never rewrites dir, `src/weapons.js:165-168`). Hysteresis: acquire ≤6°,
  hold ~10°; retarget on target death / cone exit. Behind-camera enemies never lock
  (reuse the pip dot-math, `src/combat.js:591-599`).
- **THE BOSS IS EXCLUDED from lock.** The weak-point zone centers on the boss position
  (`src/boss.js:284-288`; NODE_R 0.95, `src/boss.js:52`) and the node subtends ~1.8-2.7°
  at hold 20-30 u (`src/boss.js:38`) — a 6° lock cone would automate the ×3 weak-point
  skill the boss fight exists to test (stage-4 TTK: 4 aimed charged hits,
  `design/gdd/stage-4-balance.md` §4.2).
- **Stream bolts only.** The charged shot (≥0.6 s hold, `src/weapons.js:146-159`) stays
  the manual-aim reward — "the aimed shot is the skill, the burst is its payoff"
  (`stage-4-balance.md` §4.1).
- Lead stays manual (assist ≠ homing). Lock brackets: cyan, on the locked target only.
- Probe safety: scriptedKill spawns bolts directly via `C.bolts.spawn`
  (`src/combat.js:395-399`), bypassing `spawnBolt` — the spawn bias cannot perturb the
  mutation-pinned probe.

**Effort:** M (pipper S; the lock scan + spawn bias + persistence + brackets is the M).
**Risk:** M — feel tuning (bias magnitude, hysteresis bands); the boss exclusion and
stream-only scope are load-bearing; chargeProbe/bossProbe tap asserts must stay green.

---

## F2 — Combat HUD readability: a thin monospace text stack carries life-or-death state

**Evidence**
- `#hud-bars` is an 11px monospace block (template `:144-149`); HULL/SHIELD get 6px
  rails, BOOST is text-only (`src/combat.js:540-546` writes `BOOST n%` with no bar).
- The boss's HP is a text line `BOSS ▍▍▍ 67%` (`src/boss.js:388-392`) spliced into the
  same change-gated write (`src/combat.js:540,545`).
- No wave-change event surface exists — the wave lives in the score line
  (`src/combat.js:549`).
- Kill feedback already stacks explosion + shake + beep (`src/weapons.js:179,196-197`);
  there is no per-kill screen marker.

**Why it matters** — Honest HUD is MVP 6 (`game-brief.md:20`), and the showcase audience
(`game-brief.md:34`) reads competence from whether the HUD answers "how close to dying /
how close to the boss dying / did the wave change" at a glance. The boss fight's drama
(three phases, a 4-20-hit TTK) is currently carried by a text row; 6px rails at the
screen edge compete with the reticle for foveal time while steering.

**Proposed fix** — styled labeled HULL/SHIELD/BOOST meters; a dedicated boss HP bar
element replacing the text line; a wave banner reusing the `#combat-online` reveal
grammar (markup template `:224`, CSS `:126-130`; inside `#hud` it inherits
pointer-events:none, template `:26`); kill-only hit markers ~150 ms — per-hit markers on
an 8/s stream (`FIRE_INTERVAL = 1/8`, `src/weapons.js:45`) would triple feedback noise.

**LAWS (bind every HUD change in this stage):**
- HONESTY — every element renders state, never decoration, and is harness-readable from
  `combatState()` (the change-gated write pattern, `src/combat.js:536-562`, is the
  precedent).
- ELEMENT-BUDGET — reticle = steer/charge, pipper = bolt path, bracket = lock,
  pips = off-screen threats. Nothing new claims an existing element's job.

**Effort:** M. **Risk:** low-M — DOM restructure of change-gated writes; preserve the
`lastBars`/`lastChips` gate contract (`src/combat.js:546,561`) or the harness loses its
determinism.

---

## F3 — Pause card is player-hostile if buttons ship naively

**Evidence** — the OS cursor is hidden while playing: `body.playing, body.playing *
{cursor:none !important}` (template `:19-20`), toggled only inside `setPhase`
(`src/phases.js:121-123`; combat is in `PLAYING_PHASES`, `:126`). Pause does NOT change
phase: `setPaused` toggles the overlay + suspends audio only (`src/input.js:21-31`).
The planned RESUME/SOUND buttons (none exist today — template `:201` is text-only) would
therefore render under a live `cursor:none`: present, but unseeable and unaimable.

**Why it matters** — "never stuck on an overlay" is the brief's own definition of working
(`game-brief.md:12`). A pause menu whose buttons cannot be seen or clicked is a
stuck-overlay to the player even though P/ESC still resumes.

**Proposed fix** — restore the OS cursor while paused: scope the fix to the pause overlay
(cursor:auto on `#pause` while visible, or exempt it from `.playing` for the pause
state); it re-hides with the overlay on resume (`src/input.js:29`). One-line-class rider
that MUST ride with the buttons — shipping the buttons without it ships the defect.

**Effort:** S. **Risk:** low. The P/ESC resume path (`src/input.js:46`) must keep
working untouched — the cursor fix must not gate on anything pointer-related.

---

## F4 — Title/controls text: one dense all-caps run-on; the T control must land in BOTH places

**Evidence** — the hint bar is a single all-caps run-on line (template `:256`); the
CONTROLS panel is structured HTML (`src/hud.js:31-43`). The project's forced rule:
controls text updates land in BOTH places it lives — CONTROLS panel + hint bar
(`design/gdd/full-3d-flight.md:42-46` pillar commitment, `:96-99` forced clause; that
clause's "src/main.js L62-66" pointer is stale — `PANEL_HTML.CONTROLS` lives in
`src/hud.js` since the TD-003 move). T is free in combat: combat handles
Space/P/ESC/M only (`src/input.js:40-48`); T is bound only in the closed spin viewer
(`src/input.js:35-38`).

**Why it matters** — "obvious controls" is the closing pillar (`game-brief.md:34`). A new
T control that appears in only one of the two text places regresses against the same
rule story-015 was forced to obey; an undocumented toggle is an undiscoverable one.

**Proposed fix** — split the hint into a two-column block; add the T lock line to BOTH
the hint bar and `PANEL_HTML.CONTROLS`, in the shipped all-caps grammar.

**Effort:** S. **Risk:** low — the risk is omission, not commission: the unupdated place
is the defect.

---

## F5 — Death/victory cards: the most-seen screens are plain text rows

**Evidence** — SHIP LOST (template `:202-210`) and VICTORY (`:211-218`) are h2 + text
rows + pill buttons, while the title carries corner chrome, scanlines, brand gradient
and tagline (template `:238-262`). Every run ends on one of these cards — die→card→
replay is the core loop (`game-brief.md:8`).

**Why it matters** — the cards are the game's handshake at its two highest-emotion
moments, failure and win; for the showcase player they are also the most-repeated
screens. A styling pass with the title's chrome grammar and the existing `.pill` button
grammar (template `:83-89`) closes the polish gap without touching behavior.

**Proposed fix** — same styling pass as the title; no new mechanics, no new information.

**Effort:** S-M. **Risk:** low — do not touch card enter/exit contracts
(`src/phases.js:76-113`) or the exactly-once probe counters (`phases.js:110`).

---

## F6 — RECORD 0 / HIGH SCORE 0 flash before storage warms

**Evidence** — `readHighscore()` returns 0 pre-warm by design (`src/store.js:24-25`; the
story-007 laziness comment states "title renders 0, warm-up re-renders the real value"),
and the warm callback re-renders via `refreshRecordLine` (`src/hud.js:54-57`).

**Why it matters** — the title's first paint shows a false "RECORD 0" on a warm profile —
a small honesty blemish on the screen whose whole job is the first impression (MVP 6).

**Proposed fix** — suppress the record line's initial paint until the warm callback
(empty/placeholder first, then `refreshRecordLine`). Must not deadlock: blocked storage
still completes the warm path through the memory fallback (`src/store.js:14-19`).

**Effort:** S. **Risk:** low.

---

## F7 — Dev chip reads as telemetry on a player-facing bar

**Evidence** — `BUILD S4 · VI3W POWERED` sits in the title top bar (template `:241`).

**Why it matters** — it is build telemetry (and stale — the build is past S4) inside the
pro chrome an interviewer reads first. It means nothing to a player; it is noise.

**Proposed fix** — reword to player language or remove the `.t-ver` span.

**Effort:** S. **Risk:** near zero.

---

## F8 — Keep-passing UX behaviors (guard list — do not regress while polishing)

- The charge meter IS the reticle ring (`stage-4-balance.md:113`;
  `src/combat.js:567-576`; `#charge-ring` template `:162-166`). A separate meter element
  would violate the element-budget law.
- Chips are change-gated (`src/combat.js:555-562`) — the same contract binds any new HUD
  element from F2.
- The reticle `.assemble` choreography is an intentional ~2.6 s beat: B2 lands at
  `BEAT_B2 = 2.6` (`src/transition.js:12`, fired `:279-282`; `hudAssemble(true)` on
  combat entry `src/phases.js:68`; CSS template `:132-141`). The SKIRMISH path assembles
  on entry (`phases.js:68`) — a fast path, not a missing beat.

---

## Verification appendix

All cited refs were read on disk 2026-11-08 and match, with two precision notes:

1. **F1 number corrected.** The audit's "~13.8 u/s tangential" is imprecise: 13.8 =
   waveSpeed cap 12 × elite 1.15 and is the RADIAL term (`src/enemies.js:286`); the
   tangential orbit term carries a ×0.7 (`src/enemies.js:287`), peaking ~9.7 u/s. The
   mandatory-lead conclusion is unchanged (≈13° lead at 20 u; rammers ~15.9 u/s,
   `src/enemies.js:306`).
2. **Stale ref inside the GDD, not the audit.** `full-3d-flight.md:96-99` cites
   "src/main.js L62-66" for `PANEL_HTML.CONTROLS` — stale since the TD-003 move; the
   panel lives at `src/hud.js:31-43` (the ref this audit uses).

Node-subtend check for F1's boss exclusion: NODE_R = 0.95 (`src/boss.js:52`) at
ORBIT_HOLD 30 / RAGE_HOLD 20 (`src/boss.js:38`) subtends ~1.8-2.7° angular radius — the
audit's "~2° at hold range" holds, and a 6° lock cone would swallow it.
