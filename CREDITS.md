# CREDITS — downloaded assets

| Asset | Author | License (verbatim) | Source | Added |
| --- | --- | --- | --- | --- |
| Orbitron 700, latin woff2 | The Orbitron Project Authors (github.com/theleagueof/orbitron) | "This Font Software is licensed under the SIL Open Font License, Version 1.1." | Google Fonts CSS API → fonts.gstatic.com | 2026-11-03 |
| Rajdhani 500 + 700, latin woff2 | Indian Type Foundry (info@indiantypefoundry.com) | "This Font Software is licensed under the SIL Open Font License, Version 1.1." | Google Fonts CSS API → fonts.gstatic.com | 2026-11-03 |

License sources fetched verbatim from `raw.githubusercontent.com/google/fonts/main/ofl/<family>/OFL.txt` on 2026-11-03.

Models are not downloads: the hero spaceship and the stage-one rocket were made in Vi3W (app.vi3w.in).

## Handoff — SFX + music (stage-6 A1a: LANDED + superseded)

- **Kenney Sci-Fi Sounds 1.0** — license verified on kenney.nl/assets/sci-fi-sounds on 2026-11-03
  ("Creative Commons CC0", linked to https://creativecommons.org/publicdomain/zero/1.0/) and again
  from the pack zip's own License.txt on 2026-11-08 ("License: (Creative Commons Zero, CC0)" —
  Sci-Fi Sounds 1.0, created/distributed by Kenney, www.kenney.nl). The site's download button is
  JavaScript-gated (a signed link fetched via `kenney.nl/download-link/`), so the zip was fetched
  through that endpoint into a temp dir; only the 9 selected .ogg files below were copied into
  `src/assets/sfx/` — the zip and the leftover pack files are NOT in the repo.
  Landed files (exact pack filename → shipped name, raw bytes):

  | Pack file | Shipped | Bytes | Role |
  | --- | --- | --- | --- |
  | laserSmall_000.ogg | laser-a.ogg | 7,286 | player stream shot (round-robin a) |
  | laserSmall_002.ogg | laser-b.ogg | 8,973 | player stream shot (round-robin b) |
  | explosionCrunch_000.ogg | explosion-a.ogg | 28,274 | kill boom (round-robin a) |
  | explosionCrunch_001.ogg | explosion-b.ogg | 47,916 | kill boom (round-robin b) |
  | impactMetal_000.ogg | impact.ogg | 15,491 | player hurt (all damagePlayer sources) |
  | forceField_001.ogg | pickup.ogg | 28,947 | powerup collect |
  | laserRetro_004.ogg | ui-click.ogg | 12,701 | UI confirm (every button) |
  | laserLarge_000.ogg | efire-a.ogg | 25,566 | enemy bolt fire (round-robin a) |
  | laserLarge_003.ogg | efire-b.ogg | 26,104 | enemy bolt fire (round-robin b) |

  Total: 201,258 B raw (≈ 268 KB as base64 ×4/3) — inside the ≤ 120 KB/file, ≤ 800 KB total
  budget. Selection rationale + provenance: `production/qa/evidence/stage6-a1/pack-manifest.md`.
  Wiring: `audio.sample()` (src/audio.js) — LAZY decode on first use, ±5% pitch jitter per play,
  round-robin over same-family variants, and the CONSOLE-SILENT synth fallback on decode failure
  (probe-visible status, never a console line). Launch rumble/beeps stay procedural by design.
- **Music loop** (≤ 1 MB, CC0): DROPPED by the recorded size decision (stage-6 audit council,
  2026-11-08) — music + sfx base64 together would push the single-file build past the 6 MB
  ceiling. Music stays procedural (the story-009 pads + the stage-6 A1b sequencer layer). This
  bullet is superseded, not lost — a future builder must NOT stage `src/assets/music/loop.ogg`
  under the current size contract.
