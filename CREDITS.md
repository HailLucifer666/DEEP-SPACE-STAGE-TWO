# CREDITS — downloaded assets

| Asset | Author | License (verbatim) | Source | Added |
| --- | --- | --- | --- | --- |
| Orbitron 700, latin woff2 | The Orbitron Project Authors (github.com/theleagueof/orbitron) | "This Font Software is licensed under the SIL Open Font License, Version 1.1." | Google Fonts CSS API → fonts.gstatic.com | 2026-11-03 |
| Rajdhani 500 + 700, latin woff2 | Indian Type Foundry (info@indiantypefoundry.com) | "This Font Software is licensed under the SIL Open Font License, Version 1.1." | Google Fonts CSS API → fonts.gstatic.com | 2026-11-03 |

License sources fetched verbatim from `raw.githubusercontent.com/google/fonts/main/ofl/<family>/OFL.txt` on 2026-11-03.

Models are not downloads: the hero spaceship and the stage-one rocket were made in Vi3W (app.vi3w.in).

## Handoff — SFX + music (verified CC0, not yet wired)

- **Kenney Sci-Fi Sounds** — license verified on kenney.nl/assets/sci-fi-sounds on 2026-11-03:
  "Creative Commons CC0" (linked to https://creativecommons.org/publicdomain/zero/1.0/).
  The site's download button is JavaScript-gated (no direct URL in the page HTML), so the pack
  could not be fetched headlessly. Human step: download the zip from kenney.nl, pick ~8 small
  .ogg files (laser, explosion, impact, warp, UI confirm), drop them in `src/assets/sfx/`, and
  tell the agent the filenames — wiring (`audio.sample()` with ±5% pitch jitter and a synth
  fallback on decode failure) happens in that pass. Launch rumble/beeps stay procedural by design.
- **Music loop** (≤ 1 MB, CC0): same handoff — one file at `src/assets/music/loop.ogg`.
