# Story 020: settings persistence (mute survives a reload)

> **Epic**: combat-feel-fix (Stage 5 — ship prep)
> **Status**: Pending — scope LOCKED and recorded 2026-11-07 before any Stage 5 code (the gate-first write-down, stage-4 precedent)
> **Layer**: Logic
> **Type**: Logic (test evidence BLOCKING)
> **Estimate**: M
> **Last Updated**: 2026-11-07

## Provenance — the handoff line + the scope finding

`one-shot-work/HANDOFF-2026-11-06.md` L163/L497: "020 | settings persistence". The brief's
phrase "mute/quality-type choices" is resolved by disk truth (verified 2026-11-07): **the
build's only user-facing setting is mute** — toggled by the M key and the
`[ SOUND: ON/OFF ]` button (`src/hud.js` btn-sound), held in `let muted = false`
(`src/audio.js` L6) with no persistence whatsoever; every reload resets it to unmuted.
The spec-#19 "quality" ladder (DPR → bloom degrade) is **automatic**, not a player choice,
and `design/gdd/stage-4-balance.md` L39 + HANDOFF L517 keep a settings page explicitly out
of scope. The mute-only reading is presented for player confirmation at the stage-5 open
checkpoint (2026-11-07) — this file is committed BEFORE that ask lands, per the gate-first
order; if the player overrides, this Provenance section is amended same-commit. Persistence
therefore means: **the mute choice survives a reload**, via the
existing guarded store — and the store surface it lands on is written so any future
setting rides the same contract.

## Goal

1. **Persist mute through the existing guarded store (`src/store.js` pattern)** — no new
   storage access anywhere else, no new storage *mechanism*:
   - `src/store.js` gains `MUTED_KEY = 'stage2.muted'`, `readMuted()` and
     `writeMuted(m)`, each a mechanical mirror of the highscore pair it sits beside:
     `readMuted()` returns `false` when storage is not yet warmed (the story-007 laziness
     contract — a pre-warm read never triggers the capability probe; `readHighscore`
     L24 is the precedent), reads a corrupt/garbage value as `false` never as truthy
     (the §8.9 corrupt-reads-as-safe rule), and never throws;
     `writeMuted(m)` stores `'1'`/`'0'` through `getStorage()` inside try/catch with an
     honest `console.warn` on refusal (the stage-1 dishonest-write rule — never pretend
     it was saved).
   - **Single choke point for the write**: `src/audio.js` imports store.js (store is
     self-contained, zero imports — audio→store is acyclic; dep-check verifies) and
     `setMuted(m)` persists through `writeMuted` as part of its existing body, so the
     M key and the sound button are both covered by construction with zero call-site
     changes. A new `restoreMuted(m)` export applies the stored value WITHOUT writing
     (boot's restore must not rewrite what it just read; one explicit export, one job).
   - **Restore site**: `main.js` `boot()` at the existing post-warm block — where the
     highscore re-render already lives — calls `restoreMuted(readMuted())` then
     `refreshSoundButton()`. Ordering is load-bearing: restore runs before the first
     gesture can fire `audioUnlock`, and `ensure()` L21 already reads `muted` when the
     context is first built, so a persisted-muted boot comes up silent at the master
     gain, not mute-flapping after unlock.
2. **Probe surface for the harness**: the probes report the live mute state and the raw
   stored value (probes.js conventions, `window.__stage2`), so flow-check can assert
   persistence across a real page reload without touching internals.

## Scope

- `src/store.js` — `MUTED_KEY`, `readMuted()`, `writeMuted(m)` (mirrors of the highscore
  pair; same laziness contract, same guards, same honest-warn rule).
- `src/audio.js` — `setMuted` gains the write-through; `restoreMuted(m)` added; nothing
  else in the synthesis engine changes.
- `src/main.js` — the boot() post-warm block: restore + label refresh (2–3 lines).
- `src/probes.js` — mute probe reporting for the harness.
- `tools/flow-check.mjs` — the new persistence block (red-first, below).
- `tools/index.template.html` — ZERO-DIFF (btn-sound already exists).

## Non-goals

- No settings page or settings menu (explicitly beyond 020 — HANDOFF L517; GDD
  stage-4-balance L39).
- No quality/bloom toggle, no volume slider — the degrade ladder stays automatic
  (spec #19); a user-facing quality control is NEW feature work, not persistence.
- No new storage keys beyond `stage2.muted`; no new storage access outside store.js.
- `index.html` is build output — touched only by `npm run build`.

## Acceptance criteria

- [ ] Toggle mute (the real M-key path), reload the page: the game boots muted — probe
      reads muted `true`, the sound button reads `[ SOUND: OFF ]`, zero console errors.
- [ ] Toggle back (unmute), reload: boots unmuted — persistence asserted BOTH ways.
- [ ] The raw key `stage2.muted` reads `'1'`/`'0'` after each toggle (write-through
      visible at the store, not just the flag).
- [ ] Corrupt value: `'garbage'` in the key → reload reads unmuted, no crash, console
      clean (§8.9 rule proven, not assumed).
- [ ] Laziness contract holds: `readMuted()` pre-warm returns `false` without firing the
      capability probe; boot-marks storage timing unchanged (storeStart/storeEnd stay
      behind the title mark, in the documented band).
- [ ] Storage-blocked path: inherited by construction — `readMuted`/`writeMuted` ride the
      same `getStorage()` memory fallback as the highscore pair; the fallback itself is
      already guarded and was machine-proven at story-007. Recorded as inherited
      coverage, not re-driven (driving a real blocked-storage browser is not reachable
      headless; the corrupt-read assert pins the read guard's behavior).
- [ ] Full flow-check green (170 + new), `CONSOLE []` per page; boot-marks in band;
      dep-check acyclic, main.js ≤ 500; `npm run build` regenerated index.html only.

## Test plan (red-first)

Every assert below is written, seen RED for the right reason, then trusted — mutations
recorded here with their dates per kee discipline:

1. **Persistence (both directions)** — probe toggles mute via the real key path, reloads,
   asserts muted+label; toggles back, reloads, asserts unmuted.
   - Mutation A (date on execution): remove the `writeMuted` call inside `setMuted` →
     the post-reload assert REDS (muted lost). Adjacent keep-passing: the in-session
     label/state asserts stay green (the toggle itself still works — only persistence
     dies).
2. **Corrupt-read safety** — seed `stage2.muted = 'garbage'`, reload.
   - Mutation B (date on execution): make `readMuted` return the parsed string's truth
     (`Number(...)` without the finite/0-1 clamp) → the corrupt assert REDS (boots
     muted-from-garbage).
3. **Laziness** — the pre-warm contract asserted via boot-marks ordering (storage marks
   behind the title mark) — the existing marks, re-run per build; no new tolerance.
   - Mutation C (date on execution): call `readMuted()` at module eval (audio.js top) →
     boot-marks REDS/flow-check REDS (storage probe fires before the title mark).
4. **Restore-without-rewrite** — after boot restore, the raw key is byte-identical
   (restore reads, never writes).
   - Mutation D (date on execution): boot calls `setMuted` instead of `restoreMuted` →
     the byte-identical assert REDS (a rewrite happened) — only meaningful if the stored
     value is corrupt-safe, which is why D runs against a seeded non-default value.

## Test-evidence destination

`production/qa/evidence/story-020-settings-persistence/` — the implementer's report +
probe outputs; mutation transcripts named per the pattern above.
