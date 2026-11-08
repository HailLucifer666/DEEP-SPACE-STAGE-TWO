# stage6-a1 — Kenney Sci-Fi Sounds pack manifest (story A1a)

Date: 2026-11-08. Branch: `polish/stage6-experience`. Spec: `production/polish/audio-audit.md` §3 A1a
(per file ≤ 120 KB raw, total ≤ 800 KB raw). License already verified in `CREDITS.md:14-21`.

## Pack provenance

- **Pack**: Sci-Fi Sounds **1.0** — created/distributed by Kenney (www.kenney.nl), creation date
  11-10-2020 (pack zip `License.txt`, read verbatim on 2026-11-08).
- **License (verbatim, from the zip's License.txt)**: "License: (Creative Commons Zero, CC0)
  http://creativecommons.org/publicdomain/zero/1.0/" — matches the CREDITS.md site verification of
  2026-11-03 ("Creative Commons CC0", https://creativecommons.org/publicdomain/zero/1.0/).
- **Download**: the kenney.nl download button is JavaScript-gated (as CREDITS.md recorded); the
  zip was fetched 2026-11-08 by driving the site's own endpoint (`GET /download-link/<hex-id>`
  returns a signed JSON URL; `GET` on it returned the 5,875,104-byte zip) into a TEMP dir
  **outside the repo**. The zip and the 64 unselected pack files were never committed; only the 9
  selected `.ogg` files below were copied into `src/assets/sfx/` with semantic names.

## Selection (9 files, 201,258 B raw — 25.2% of the 800 KB budget)

| Pack file | Shipped name | Bytes | Role / rationale |
| --- | --- | --- | --- |
| laserSmall_000.ogg | laser-a.ogg | 7,286 | Player stream shot, round-robin A — the small-laser family is a tight zappy shot that reads at 8/s without smearing the mix; the shipped sweep stays as the CONSOLE-SILENT fallback. |
| laserSmall_002.ogg | laser-b.ogg | 8,973 | Player stream shot, round-robin B — same-family variant (Kenney variants are authored to intercut); alternating breaks machine-gun sameness without changing the cue's identity. |
| explosionCrunch_000.ogg | explosion-a.ogg | 28,274 | Kill boom, round-robin A — crunchy mid-forward boom for raider/orb/boss-hit explosions. |
| explosionCrunch_001.ogg | explosion-b.ogg | 47,916 | Kill boom, round-robin B — same-family variant with a longer tail. |
| impactMetal_000.ogg | impact.ogg | 15,491 | Player hurt (all four `damagePlayer` sources) — a metallic thud that unambiguously reads "I took damage", distinct from the kill boom (audio-audit gap 9). |
| forceField_001.ogg | pickup.ogg | 28,947 | Powerup collect — the shimmering activation is this pack revision's closest match to the handoff's "warp/UI confirm" pickup intent (this pack ships no `warp_*`/`powerUp_*`/`confirmation_*` files; the pack's full 73-file inventory was inspected before choosing). |
| laserRetro_004.ogg | ui-click.ogg | 12,701 | UI confirm (every button) — a short tonal retro blip; at the audit's 0.1 vol through the bus it reads as a confirm tick. |
| laserLarge_000.ogg | efire-a.ogg | 25,566 | Enemy bolt fire, round-robin A — the LARGE-laser family is deliberately heavier than the player's small lasers: incoming fire must warn, and ONE timbre covers gunners + the boss volley (both ride the same bolt pool). |
| laserLarge_003.ogg | efire-b.ogg | 26,104 | Enemy bolt fire, round-robin B — same-family variant. |

**Total: 201,258 B raw → ≈ 268 KB as base64 ×4/3 on the single-file bundle.** Measured build:
4.44 MB (pre-A1) → **4.70 MB** (post-A1) against the 6.0 MB ceiling — +0.26 MB, matching the
projection. The handoff's **music `loop.ogg` was DROPPED by the recorded size decision**
(audio-audit §3 A1a / CREDITS.md — recorded there on 2026-11-08); music stays procedural
(story-009 pads + the A1b sequencer).

## Wiring (spec-conformant)

- `tools/build.mjs:34` — loader extended: `'.ogg': 'dataurl'` (the fonts pattern; the static
  template never sees esbuild).
- `src/sfx-pack.js` — the manifest module: data-URL imports + the name → urls registry.
- `src/audio.js` — `audio.sample(name, opts)`: LAZY decode on first use (promise memoized —
  concurrent first-plays share one decode; synchronous `atob` base64 decode so no fetch machinery
  lands on a mid-combat fire frame), ±5% pitch jitter per play, round-robin over same-family
  variants, voice-cap subject, and the CONSOLE-SILENT synth fallback on decode failure
  (probe-visible status via `sampleStatus()` — a failing sample NEVER logs).

## Verification evidence (this folder)

- `flow-red-a1.txt` — RED-FIRST: full harness on the pre-A1 build (product untouched), 244 passed
  / 11 failed — the 13 new A1 asserts recorded red-by-absence (probe surface absent, samples
  unwired); all 242 pre-existing asserts green.
- `flow-green-a1.txt` — final full harness on the A1 build: **255 passed / 0 failed**
  (`flow-green-a1-run2.txt` — a second consecutive 255/0 run for timing-band stability).
- `flow-mutation-a-seqstep.txt` — MUTATION (a): the sequencer step advance removed → the two
  sequencer-counter asserts RED (counter frozen at 0), 253/2, everything else green.
- `flow-mutation-b-voicecap.txt` — MUTATION (b): the voice-cap refusal removed (single point
  inside `voiceBegin`) → the cap assert RED (recorded peak 35 > 24), 254/1, everything else
  green. (A first attempt that mutated only the call site was VACUOUS — `voiceBegin` still
  declined to count past 24 internally — discarded and redone; the vacuous attempt's transcript
  was overwritten by the honest one.)
