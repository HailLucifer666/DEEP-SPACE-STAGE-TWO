# story-020 — settings persistence (mute survives a reload) — EVIDENCE REPORT

> Branch `story-020-settings-persistence` (from master @ f4b94ad, the stage-5 gate-first
> commit). Written 2026-11-07 by the UI programmer. All numbers below are real tool outputs
> from this branch; raw outputs live beside this report. Scope confirmed MUTE-ONLY: no
> quality toggle, no settings page (both out of scope per the story's Provenance/Non-goals).

## 1. What was built (file:line for every change)

| File | Change |
| --- | --- |
| `src/store.js:40-61` | The story-020 block: `MUTED_KEY = 'stage2.muted'` (L43), `readMuted()` (L44-48 — pre-warm guard returns `false` without triggering the capability probe, the readHighscore pre-warm guard is the precedent; the read is `=== '1'` so ONLY the canonical `'1'` is muted — `'garbage'`, `'2'`, `'0'`, `null` all read unmuted, the §8.9 rule; never throws), `writeMuted(m)` (L50-53 — stores `'1'`/`'0'` through `getStorage()` inside try/catch with an honest `console.warn` on refusal, the stage-1 dishonest-write rule), `readMutedRaw()` (L56-61 — the probe seam, see Deviation 1: guarded raw read, pre-warm returns `null` without probing). Mechanical mirrors of the highscore pair they sit beside. |
| `src/audio.js:6` | `import { writeMuted } from './store.js';` — the one new import edge (store is self-contained; audio→store acyclic, dep-check verifies). |
| `src/audio.js:47` | `setMuted` gains the write-through: `writeMuted(muted);` immediately after the flag flip — the SINGLE write choke point, so the M key (input.js L46) and the sound button (main.js L111 click) both persist with zero call-site changes, exactly as the story specifies. |
| `src/audio.js:54-60` | New `restoreMuted(m)` export: applies the stored value WITHOUT writing (no `writeMuted`, no `musicFlush` — at the warm block the context is not yet unlocked, and `audioUnlock`'s own flush covers the gesture path). Sets the master gain if a context already exists (a first gesture that beat the warm block), else `ensure()` reads `muted` when the context is first built — a persisted-muted boot comes up silent at the master gain. |
| `src/main.js:11-12, 14` | Imports: `restoreMuted` added to the audio import; `readMuted, readMutedRaw` added to the store import. |
| `src/main.js:150-154` | The restore site — the EXISTING post-storage-warm block (where the highscore re-render lives), extended inside the same `setTimeout(0)`: `restoreMuted(readMuted()); refreshSoundButton();` after `mark('storeEnd')` / `refreshRecordLine()`. Ordering is load-bearing: this runs before any first-gesture `audioUnlock`, and it does NOT rewrite the key it just read. |
| `src/main.js:219` | Probe surface: `mutedRaw: () => readMutedRaw()` on the `window.__stage2` literal (see Deviation 2 for why it is not in src/probes.js). |
| `src/probes.js` | ZERO-DIFF (see Deviation 2). |
| `tools/index.template.html` | ZERO-DIFF (`btn-sound` already exists, L252, initial text `[ SOUND: ON ]`). |
| `tools/flow-check.mjs:1630-1823` | The new persistence block (18 asserts) + the page-boundary console assert for the story-014 edge page it follows. Structure follows the house page pattern: `Page.navigate` reloads over the same CDP session/profile (localStorage genuinely persists — the same mechanism the highscore ledger rides), guarded thrown-tolerant polls, per-page `CONSOLE []` asserts. The toggle is driven through the REAL key path: synthetic `KeyboardEvent` on window → input.js's combat-branch `KeyM` handler → `setMuted` — hence `?goto=combat` on every page (the M key only reaches `setMuted` in combat; at title only the button path exists — disk-verified input.js L39-47). |

Line counts after the story: store.js 36 → 61, audio.js 381 → 395, main.js 255 → 260
(limit 500), flow-check.mjs 1641 → 1834. All src files far under the 800 budget.

## 2. The new assert list (17 story asserts + 1 page-boundary console assert; 170 → 188)

1. `CONSOLE [] (story-014 edge page)` — page-boundary assert (stage-2 review convention: each clean page asserts its console before the next navigate; this page previously relied on the final generic one).
2. `story-020: storage marks behind the title mark (storeStart ≥ title — never BEFORE, same-ms legal — storeEnd ≥ storeStart; story-007 laziness, re-run per build)` — reads `window.__BOOT` on the block's first page.
3. `story-020: boots unmuted by default (muted false, [ SOUND: ON ])`
4. `story-020: M-key toggle mutes in-session (muted true)` — real key path
5. `story-020: M-key write-through at the store (raw stage2.muted = '1')` — the write visible AT the store, not just the flag
6. `CONSOLE [] (story-020 toggle page)`
7. `story-020: mute survives a real reload (boots muted, [ SOUND: OFF ])` — AC 1, label included
8. `story-020: raw key still '1' after the reload (persisted, not session-only)`
9. `story-020: M-key unmute in-session (muted false)`
10. `story-020: unmute write-through at the store (raw stage2.muted = '0')`
11. `CONSOLE [] (story-020 muted-reload page)`
12. `story-020: unmute survives a real reload (boots unmuted — persistence asserted BOTH ways)` — AC 2, label included
13. `story-020: raw key '0' after the unmute reload`
14. `CONSOLE [] (story-020 unmuted-reload page)`
15. `story-020: corrupt value 'garbage' boots unmuted, no crash (§8.9 never truthy)` — AC 4, console-clean asserted by 17
16. `story-020: corrupt seed survives boot byte-identical (restore reads, never rewrites)` — test-plan 4 / mutation D's guard
17. `CONSOLE [] (story-020 corrupt page)`
18. `story-020: numeric garbage '2' boots unmuted (the 0-1 clamp — mutation B's discriminator)` — the adjacent keep-passing-strengthening case, see Deviation 3

(The pre-existing final `CONSOLE []` now also covers the numeric-garbage page.)

AC coverage map: AC1 → 4/5/7/8; AC2 → 9/10/12/13; AC3 (raw `'1'`/`'0'` after each toggle) → 5/10; AC4 → 15/16/17; AC5 (laziness) → 2 + boot-marks runs; AC6 (storage-blocked) → inherited coverage per the story (story-007 machine proof; not re-driven — the corrupt-read assert pins the read guard); AC7 (battery) → §5.

## 3. Red-first record (all dates 2026-11-07; every mutation: apply → `npm run build` → FULL flow-check → `git checkout` restore → rebuild)

### 3.1 The red run (BEFORE any product change)

Harness block committed first (commit fb4fe70), run against the unmodified story-019 gate
build: **181 passed / 7 failed** (`flow-red-story020.txt`). The 7 reds, each for its
no-persistence reason:

```
FAIL  story-020: M-key write-through at the store (raw stage2.muted = '1')  [raw=null]
FAIL  story-020: mute survives a real reload (boots muted, [ SOUND: OFF ])  [{"m":false,"label":"[ SOUND: ON ]","raw":null}]
FAIL  story-020: raw key still '1' after the reload (persisted, not session-only)  [raw=null]
FAIL  story-020: M-key unmute in-session (muted false)  [{"m":true,...}]   ← the reload lost the mute; the press RE-MUTED
FAIL  story-020: unmute write-through at the store (raw stage2.muted = '0')  [raw=null]
FAIL  story-020: raw key '0' after the unmute reload  [raw=null]
FAIL  story-020: corrupt seed survives boot byte-identical (restore reads, never rewrites)  [raw=null]  ← mutedRaw absent: red by absence
```

Green-by-design on the old build (keep-passing): the default/corrupt/numeric boot-state
reads (the old build ignores the key → boots unmuted, the safe-by-accident side), the
in-session MUTE toggle (the toggle always worked), the laziness marks (story-007 predates
this story), the CONSOLE pages.

### 3.2 Mutations A-D (post-green, observed failure lines quoted)

**Mutation A — the `writeMuted(muted)` write-through line removed from `setMuted`**
(`flow-mutation-a-writethrough-removed.txt`): **182 passed / 6 failed**.

```
FAIL  story-020: M-key write-through at the store (raw stage2.muted = '1')  [raw=null]
FAIL  story-020: mute survives a real reload (boots muted, [ SOUND: OFF ])  [{"m":false,"label":"[ SOUND: ON ]","raw":null}]
FAIL  story-020: raw key still '1' after the reload (persisted, not session-only)  [raw=null]
FAIL  story-020: M-key unmute in-session (muted false)  [{"m":true,"label":"[ SOUND: ON ]","raw":null}]
FAIL  story-020: unmute write-through at the store (raw stage2.muted = '0')  [raw=null]
FAIL  story-020: raw key '0' after the unmute reload  [raw=null]
```

Adjacent keep-passing (the story's named case): the in-session MUTE toggle stays GREEN
(`m:true` — the toggle itself works, only persistence dies), plus all 176 non-story asserts.

**Mutation B — `readMuted`'s `=== '1'` clamp replaced by the parsed string's truth,
`!!Number(get(MUTED_KEY))`, no finite/0-1 clamp** (`flow-mutation-b-unclamped-parse.txt`):
**187 passed / 1 failed**.

```
FAIL  story-020: numeric garbage '2' boots unmuted (the 0-1 clamp — mutation B's discriminator)  [{"m":true,"label":"[ SOUND: OFF ]","raw":"2"}]
```

boots MUTED-from-garbage, exactly the story's predicted failure mode. Known discrimination
bound (recorded beside the assert and in the harness comment): the AC's `'garbage'` seed
CANNOT red this mutation — `Number('garbage')` is NaN, falsy by accident rather than by
guard — so the block seeds `'2'` (numeric garbage), the value class the unclamped parse
turns into mute state; the `'garbage'` page stayed green under B as predicted.

**Mutation C — the restore moved to module eval: `setMuted(readMuted());` at audio.js top**
(`flow-mutation-c-eval-restore.txt` + `boot-marks-mutation-c.txt`): flow-check **183 passed
/ 5 failed**, boot-marks red. The root is worse than the naive wiring looks: the eval-time
`readMuted` runs PRE-WARM (the laziness guard legitimately returns `false`), and
`setMuted`'s write-through then PERSISTS that false — every page load CLOBBERS the stored
value. Observed:

```
FAIL  story-020: mute survives a real reload (boots muted, [ SOUND: OFF ])  [{"m":false,"label":"[ SOUND: ON ]","raw":"0"}]   ← stored '1' destroyed before the warm read
FAIL  story-020: raw key still '1' after the reload (persisted, not session-only)  [raw="0"]
FAIL  story-020: M-key unmute in-session (muted false)  [{"m":true,...,"raw":"1"}]
FAIL  story-020: unmute write-through at the store (raw stage2.muted = '0')  [raw="1"]
FAIL  story-020: corrupt seed survives boot byte-identical (restore reads, never rewrites)  [raw="0"]   ← seeded 'garbage' rewritten to '0' at eval
```

boot-marks (fresh/cold profile) — the story's stated consequence, "storage probe fires
before the title mark": TRUE wait (navigation → title) **11,420 ms** vs the green build's
6,078–6,963 ms (three runs) — the story-007 cold-storage stall (~4.9 s) moved INSIDE module
eval, in front of the title mark — and the storage-marks gap collapsed from 4,238 ms
(green: the probe behind title) to **0 ms** (the probe already fired at eval; the warm
`getStorage()` is a memoized no-op). MODULE → TITLE itself stays in band (138 ms) because
the marks are relative to PERF_T0, which is captured after the eval stall — TRUE wait is
the witness. The marks-ORDERING flow-check assert stays green under C (main.js's warm marks
are unconditional; the ordering cannot see an eval-time probe) — recorded as such in the
harness comment.

**Mutation D — boot's warm block calls `setMuted(readMuted())` instead of
`restoreMuted(readMuted())`** (`flow-mutation-d-setmuted-restore.txt`): **187 passed /
1 failed** — the target assert reds ALONE:

```
FAIL  story-020: corrupt seed survives boot byte-identical (restore reads, never rewrites)  [raw="0"]
```

the warm `setMuted(false)` rewrote the seeded `'garbage'` → `'0'`. Persistence itself stays
green (`setMuted` writes the same canonical values; the corrupt-read assert reads `'0'` →
unmuted ✓) — exactly the isolation the story prescribes. Only meaningful against a seeded
non-default corrupt value: with `'1'` stored, `setMuted(true)` would rewrite `'1'`
byte-identically and the assert could never red.

Mutation-craft note (recorded honestly): the first D application appended the comment
INSIDE the `setTimeout` line and the `//` swallowed the `}, 0);` line-ender — the build
failed (esbuild syntax error), caught by reading the build output BEFORE any harness run;
re-applied with the line-ender intact. No run was captured against the broken tree.

## 4. Adjacent keep-passing cases (one per guard, per the discipline)

| Guard | Adjacent keep-passing | Observed |
| --- | --- | --- |
| A (write-through removed) | the in-session MUTE toggle (`M-key toggle mutes in-session`) — the toggle works, persistence dies | GREEN under A (`m:true`), plus all 176 non-story asserts |
| B (unclamped parse) | the `'garbage'` corrupt page — NaN is falsy-by-accident; the persistence pages ('1'/'0' read correctly under both forms) | GREEN under B (187/1) |
| C (eval-time restore) | the in-session MUTE toggle (page 1: m:true, raw '1') + the marks-ordering assert | GREEN under C (the 5 reds are all the clobber root) |
| D (setMuted as restore) | the corrupt-read assert (reads '0' → unmuted ✓) + both persistence directions | GREEN under D (187/1) |

## 5. Real gate outputs (final battery on the restored tree — the committed state)

- `npm run build` — `[build] index.html  mode=bundle  4.41 MB  (326 ms)` (esbuild; index.html
  touched by nothing else).
- `node tools/dep-check.mjs` — `main.js lines: 260 (limit 500)` · `[dep-check] PASS —
  acyclic, structural rules hold`. The one new edge: `audio.js -> store.js`; store.js still
  imports nothing.
- `node tools/flow-check.mjs` — `FLOW-CHECK PASS — 188 passed, 0 failed`
  (`flow-green-final.txt`; the first post-implementation run, `flow-green-story020.txt`,
  also read 188/0). All 14 per-page console asserts green (`CONSOLE []` per page).
- `node tools/boot-marks.mjs` (headed) — `boot-marks-final.txt`: `title 1340 <
  storeStart 1560 < storeEnd 6080` (storage marks behind the title mark; the cold-profile
  probe stall ≈ 4.5 s lands after first paint, the story-007 contract unchanged),
  `MODULE → TITLE (player wait)  1340 ms` (documented GLB variance band 158–2492 ms),
  `STATE {"phase":"title","rocket":"glb",...}`, `CONSOLE []`.
  Other recorded runs: pre-implementation baseline (`boot-marks-baseline-story019-build.txt`:
  title 1380 / storeStart 1628 / storeEnd 5234), implemented build
  (`boot-marks-green.txt`: title 810 / storeStart 810 / storeEnd 5048 — an idle-page run
  where the warm dispatch rounded into the title's millisecond; see Deviation 4).

Green run persistence values (real, from `flow-green-final.txt`): in-session toggle raw
`"1"` → post-reload `m:true, label "[ SOUND: OFF ]", raw "1"` → unmute raw `"0"` →
post-reload `m:false, label "[ SOUND: ON ]", raw "0"` → corrupt page `m:false, raw
"garbage"` (byte-identical) → numeric page `m:false, raw "2"`.

## 6. Deviations from the story file (flagged, none silent)

1. **store.js gained a 4th export, `readMutedRaw()`**, beyond the story's named surface
   (`MUTED_KEY`, `readMuted()`, `writeMuted()`). Reason: the story's own Probe-surface
   paragraph requires "the raw stored value" to be readable by the harness, and the story's
   own hard rule is "no new storage access outside store.js" — only store.js can provide a
   pre-warm-safe raw read (a naive `getStorage().get(...)` on the probe surface would fire
   the capability probe pre-warm, the exact laziness violation this story guards). Guarded
   like the pair; never probes pre-warm; never throws.
2. **The mute probe surface rides main.js's `window.__stage2` literal, not
   `src/probes.js`.** The story's Scope named probes.js for "mute probe reporting".
   Mechanical reason it cannot live there: `window.__stage2` is constructed in main.js's
   module BODY, which evaluates AFTER every imported module body — probes.js is reached via
   combat.js (main.js import), so at probes.js eval time `window.__stage2` does not exist
   yet, and the mute surface is a boot-phase concern, not a combat drive with a runtime hook
   (the only pattern by which probes modules touch `__stage2`). Every other boot-phase
   getter (`muted`, `highscore`, `musicState`, `audioLive`, `loopsCount`) lives in the same
   main.js literal — this follows the house convention. probes.js is ZERO-DIFF. The story's
   substance (the harness reports live mute state + raw stored value via `window.__stage2`
   across real reloads without touching internals) is fully delivered.
3. **A numeric-garbage seed page (`'2'`) was added beyond the AC's `'garbage'`.** Reason:
   the AC's `'garbage'` value cannot discriminate mutation B as the story specifies it
   ("Number(...) without the finite/0-1 clamp") — `Number('garbage')` is NaN, which is
   falsy regardless of any clamp; a numeric-nonzero corrupt value is the class the
   unclamped parse converts into mute state. The AC's `'garbage'` assert is implemented
   exactly as specified and additionally pins the restore-without-rewrite behavior (§2
   asserts 15/16).
4. **The laziness assert encodes `storeStart >= title` (never BEFORE), not strict `>`.**
   Reason: on an idle page the `setTimeout(0)` warm dispatch can round into the title's
   millisecond (observed in `boot-marks-green.txt`: title 810 / storeStart 810) — a strict
   `>` would be a planted flake. The discrimination that matters is preserved: any build
   that moves the storage touch before the title mark reads `storeStart < title` and reds.
   The first post-implementation run used strict `>` and passed (t 231 / s 290 on a
   harness-busy page); it was relaxed BEFORE the mutation rounds, and the final battery
   (188/0) validates the relaxed form.
5. **Commit slices: 3 commits instead of a single implementation commit** — commit 1 is the
   harness + red record (the red-first proof that the asserts predate the product change),
   commit 2 the implementation + green battery, commit 3 the mutation records + this
   report. The story's red-first discipline is the reason commit 1 exists.

## 7. Known limitations

1. **Pre-existing defect witnessed, NOT fixed (out of scope — report-only):** the M-key
   path never refreshes the sound-button label. input.js's combat-branch `KeyM` handler
   (L46) calls `setMuted(!isMuted())` with no `refreshSoundButton()`; the label only
   refreshes in the boot warm block and on btn-sound clicks. Visible in every harness
   record: in-session reads show `m:true, label "[ SOUND: ON ]"` after an M-key mute (both
   the red-first run and the green runs). Player-visible shape: mute via M in combat → the
   title button reads `[ SOUND: ON ]` until the next reload or button click. The story's
   label asserts are all POST-reload (the warm `refreshSoundButton()` covers them), so
   nothing here pins the defect as correct behavior. Owner decision for a follow-up story.
2. **The marks-ORDERING assert cannot see an eval-time storage probe** (it stays green
   under mutation C). This is inherent — main.js's warm marks are unconditional — and is
   why mutation C's red is carried by boot-marks timing (TRUE wait) + the rewrite cascade
   in flow-check. Recorded in the harness comment beside the assert.
3. **boot-marks has a pre-existing read race**: the tool breaks its poll the moment the
   `title` mark exists; on a fast/idle run the `setTimeout(0)` warm block may not have
   dispatched yet, so `storeStart/storeEnd` can print `(never fired)` (first baseline run)
   and `MODULE → FIRST TICK` can print `n/a`. Cosmetic — the marks are set-once and
   re-runs catch them; the flow-check laziness assert reads the marks after combat landing
   (always set by then). Not fixed (harness-owner call).
4. **Storage-blocked (private mode) path is inherited coverage**, per the story's own AC:
   `readMuted`/`writeMuted`/`readMutedRaw` ride the same `getStorage()` memory fallback the
   highscore pair uses, which was machine-proven at story-007; a real blocked-storage
   browser is not reachable headless. The corrupt-read assert pins the read guard's
   behavior.
5. **Environment drift (pre-existing, reported):** both CDP harnesses hardcode
   `EdgeCore\156.0.4314.58` as the default Edge binary; the installed version is
   `157.0.4341.42` (Edge auto-updated). All runs in this story passed the `EDGE` env var.
   The hardcoded defaults will break the next person who runs the tools bare.
6. **The mute flag and the raw key are read per page-load** — the muted state survives
   reloads (proven), not live tabs (a second tab does not follow a mute change in the
   first; `storage` events are not listened to). Out of the story's scope (the AC is a
   reload), recorded so nobody expects cross-tab sync.

## 8. Zero-diff confirmations

- `src/probes.js`, `tools/index.template.html` — ZERO-DIFF (see Deviation 2 for the
  probes.js ruling).
- `src/input.js`, `src/hud.js`, `src/phases.js`, `src/combat.js` and all other src files —
  untouched; the toggle paths persist through `setMuted` with zero call-site changes,
  exactly as the story's single-choke-point design specifies.
- Existing flow-check asserts — byte-identical; all 170 pass unchanged (188 total with the
  new block).

`git diff --stat master...HEAD` (whole story at report time; the untracked-at-the-time
evidence files land with commit 3):

```
 index.html                        | 372 +++++++++++-----------
 src/audio.js                      |  14 +
 src/main.js                       |  11 +-
 src/store.js                      |  25 ++
 tools/flow-check.mjs              | 173 ++++++++++
 production/qa/evidence/story-020-settings-persistence/*  | (new evidence tree)
```

## 9. Not verified / out of scope

- Cross-tab mute sync (see §7.6) — not an AC.
- A settings page, quality toggle, volume slider — explicitly out of scope (story
  Non-goals; GDD stage-4-balance L39; HANDOFF L517).
- The M-key label staleness fix (§7.1) — pre-existing, report-only.
- Headless boot-marks contrast number — the story's battery names the headed run; the
  headless contrast is a story-006 tool capability, not an 020 AC.

## 10. Comment-fix round (2026-11-07, lead-programmer quality review — comment/label changes ONLY, zero behavior change, zero new asserts)

Reviewer scope: findings 1-4 applied, findings 4/5 of the review's own numbering
(mutation-history comment length, combat-wait poll duplication) recorded with NO ACTION —
honored exactly; nothing beyond the four items below was touched.

1. **`src/audio.js` restoreMuted comment (L54-62)** — the false invariant "at the warm block
   the context is not yet unlocked" REPLACED with the true ordering story: the unlock
   listeners attach at main.js's module tail, so a gesture during GLB load can fire
   `audioUnlock` first (context built unmuted, master.gain 0.9); the `c && master`
   setTargetAtTime branch is the gesture-beat-the-warm-block fallback — without it the flag
   would say muted while the gain stayed 0.9. The branch is now documented as load-bearing
   so no maintainer deletes it as dead code. Comment grew 5 → 7 lines (restoreMuted body
   unchanged, now L63-66; setMuted/writeMuted/isMuted line refs unchanged).
2. **`src/main.js` L150-154 warm-block comment** — "this runs before any first-gesture
   audioUnlock" (a false invariant) replaced with: this normally precedes the first
   gesture; if a gesture during load beat it, restoreMuted's context branch applies the
   gain to the live context. The warm-block line itself moved L154 → L155 (one comment
   line longer); the `mutedRaw` getter moved L219 → L220. Code unchanged.
3. **`tools/flow-check.mjs` L1743** — the laziness assert label renamed to
   `story-020: warm-block marks fire after the title mark (placement pin — cannot see an
   eval-time probe; that class rides boot-marks + the C cascade)`. The old name
   ("storage marks behind the title mark…") overstated what the ordering can see; the
   placement pin is what it IS. Assert body identical (`s >= t && e >= s`); the same-ms
   legality rationale lives in the block comment above it and in Deviation 4.
4. **`src/store.js` L45** — "readHighscore L24 is the precedent" → "the readHighscore
   pre-warm guard is the precedent" (the rotting line-number pin dropped; §1's table
   mention corrected to match).

`git diff` verified comment/label-only before building (the only non-`//` changed lines
are the store.js trailing comment and the flow-check label pair — no code token moved).

**Battery after the fixes (all real outputs, this tree):**

- `npm run build` — `[build] index.html  mode=bundle  4.41 MB  (333 ms)`.
- `node tools/dep-check.mjs` — `main.js lines: 261 (limit 500)` · `[dep-check] PASS —
  acyclic, structural rules hold`.
- `node tools/flow-check.mjs` — `FLOW-CHECK PASS — 188 passed, 0 failed`
  (`flow-green-commentfix.txt`); the ONLY output-visible change is the renamed laziness
  label (assert delta: none — 188 = 188, and its read is healthy:
  `{"t":283,"s":355,"e":355}`).
- `node tools/boot-marks.mjs` (headed) — `title 1456 < storeStart 1691 < storeEnd 5324`
  (storage marks behind the title mark, cold probe ≈ 3.6 s behind title),
  `MODULE → TITLE (player wait)  1456 ms` (documented band 158–2492 ms),
  `STATE {"phase":"title","rocket":"glb",...}`, `CONSOLE []`.

Session note (recorded honestly): between the evidence commit (6ce392a) and this round,
the working tree was found checked out on `master`, which had advanced by one docs-only
commit (`d8cd685` — `one-shot-work/stage-5/PROGRESS.md` only, zero overlap with any file
this story touches). The branch `story-020-settings-persistence` and its three commits were
verified intact (`git log` + content checks) before checking it back out; no master commit
was merged into the branch (the orchestrator owns the merge — the docs commit cannot
conflict with this story's files).
