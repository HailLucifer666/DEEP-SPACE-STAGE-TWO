# STAGE TWO: the "Million-Dollar Look" plan (free assets)

This is the plan for the visual and audio overhaul, using free assets for the sky, ships, boss, effects, sound and music. It replaces milestone M3 in the v2 master plan. It also reverses that plan's "procedural first" default, because you asked for free assets throughout.

A game reads as expensive when everything on screen belongs to one style, the lighting agrees with the sky, every action has visible and audible feedback, and the sound has weight. Free assets supply the parts. They do not supply the consistency, so most of this plan is about making the parts match.

I wrote this without the repo open. Anything that depends on code I have not read is marked **Check**. Licences were looked up while writing; confirm each one on its download page before the file goes into the repo.

## 1. Three decisions before any download

| # | Decision | Recommendation |
|---|---|---|
| L1 | **One look.** Stylized (clean low-poly shapes, metal and glowing trim, strong bloom, rich sky) or realistic (scanned rocks, photo textures, detailed ships). | Stylized. The best free ship kits are low-poly, so enemies, boss and props can all come from the same family. Free realistic ships are rare, heavy and mostly need attribution. **Check** that the Vi3W rocket fits; the hero ship decides this more than anything else. |
| L2 | **Build size.** `index.html` is 4.9 MB today. This plan adds about 12.5 MB. | Keep the single file and raise the cap to 20 MB. The tests and repo rules assume one file. Do not start until the 60 s boot is explained (task 0.5 in the master plan): if boot time grows with payload, this plan makes it several times worse. |
| L3 | **Licences.** The repo is due to go public. | CC0 or public domain first. CC BY is fine with a credit line. Nothing that forbids redistributing the files (Sonniss, Pixabay), since a public repo redistributes them. |

## 2. What comes first

From the v2 master plan: all of Phase 0 (a smoke check that can be trusted, the boot investigation, the budget check, the headed frame-time probe) and story 7.5, which is already in progress.

This plan can then run before flight v2. Nothing here depends on the new flight model except that the dust (V2) and engine plume (V7) get one more tuning pass after the pulse drive lands.

The repo protocol is unchanged: one story per session on its own branch, red-first, full battery after every step, you judge the screenshots.

## 3. Free asset list

| Need | Source | Licence | Use |
|---|---|---|---|
| Nebula skybox | Space 3D generator, tools.wwwtyro.net/space-3d | Generator code is Unlicense; the output is yours | Six cube faces with stars, nebula and a sun. Pick the seed to match the palette. |
| Star field (if L1 is realistic) | NASA SVS Deep Star Maps 2020, svs.gsfc.nasa.gov/4851 | Public domain; NASA asks for a credit to SVS and the Gaia team | Equirectangular EXR. Tone-map and downsize at build. |
| Planet textures | Solar System Scope, solarsystemscope.com/textures | CC BY 4.0 (credit required) | 2K maps for the gas planet |
| Enemy ships, props, boss parts | Quaternius Ultimate Space Kit (92 models, glTF) and Ultimate Spaceships; Kenney Space Kit | CC0 | One family for the whole cast |
| Rocks | Poly Haven rock models and textures; ambientCG rock materials | CC0 | 3 asteroid variants |
| Explosions, fire, smoke | Unity Labs VFX flipbooks (Explosion00–02, FireBall01–04, WispySmoke01–03) | CC0 | Animated explosion sheets |
| Sparks, flares, muzzle flash, trails | Kenney Particle Pack | CC0 | Small additive sprites |
| Sound effects | Kenney Sci-fi Sounds (70 lasers, thrusters, UI), Impact Sounds, Interface Sounds; Freesound with the CC0 filter | CC0 | Layered under the existing synth sounds |
| Boss music | "Space Boss Battle" by MintoDog on OpenGameArt (loopable, OGG and MP3) | CC0 | Boss cue |
| Cruise and combat music | OpenGameArt, filtered to CC0 | CC0 per track | Pick by ear. Check the licence on each track page; similarly named tracks carry different licences. |
| HUD frames and icons | Kenney UI Pack Sci-Fi | CC0 | Panel borders, icons |
| Key-cap icons | Kenney Input Prompts | CC0 | Controls hint and pause card |

For the boss there are two routes. The recommended one is to assemble it from parts of the same kit as the enemies, so it matches them. The other is a single downloadable model from Sketchfab filtered to CC0 or CC BY; check the licence badge on the model page, because search results mislabel them.

## 4. Size budget

Sizes are the optimised files before inlining. Inlining as base64 adds a third.

| Group | Budget |
|---|---|
| Sky | 0.8 MB |
| Planet and black hole textures | 0.6 MB |
| Rocks | 0.6 MB |
| Enemy models (3 classes) | 0.9 MB |
| Boss | 1.5 MB |
| Effect textures and flipbooks | 0.8 MB |
| Music (cruise, combat, boss, two short stings; about 290 s at 96 kbps) | 3.5 MB |
| Sound effects | 0.6 MB |
| UI icons | 0.1 MB |
| **Added** | **9.4 MB, which is 12.5 MB inlined** |

With today's 4.9 MB that gives about 17.4 MB against the 20 MB cap. The budget check from Phase 0 enforces the cap and each group's line.

## 5. Pass 0: asset pipeline

Nothing goes into the game by hand. These three stories come first.

| ID | Story | Done when |
|---|---|---|
| P1 | `assets-src/` holds the original downloads and is never inlined. `tools/asset-build.mjs` writes optimised files that the existing build inlines. **Check** how `build.mjs` and `assets.js` inline the two GLBs today, and follow that. | One command rebuilds every asset from its original |
| P2 | `assets-src/MANIFEST.json`: name, source URL, author, licence, original size, shipped size. `CREDITS.md` is generated from it. | Build fails when a shipped asset has no manifest entry |
| P3 | Run the two existing GLBs through the pipeline before adding anything. | Payload change recorded in `LEDGER.md` |

Pipeline settings:

- **Models:** `gltf-transform optimize in.glb out.glb --compress quantize --texture-compress webp --texture-size 1024`. Use `quantize`, not the default `meshopt` or `draco`: three's `GLTFLoader` reads quantized meshes and WebP textures with no extra decoder, so there is no new runtime dependency.
- **Flipbooks:** the Unity sheets are large TGA or EXR files. Downsize to 1024 px sheets and save as WebP with premultiplied alpha.
- **Music:** trim to a clean loop, normalise all cues to the same loudness with ffmpeg's `loudnorm`, encode at 96 kbps.
- **Sound effects:** mono, trimmed tight, 2 or 3 variants per sound.
- `gltf-transform` and ffmpeg are build-time tools. **Check** whether the NO-NEW-DEPS rule covers dev tools; if it does, this needs a sanctioned exception.

## 6. Pass 1: the frame

This pass changes every screenshot, so it goes first.

| ID | Story | Notes |
|---|---|---|
| V1 | Skybox | Cube texture as `scene.background`. Keep the nebula darker than the bloom threshold so only the sun and the brightest stars glow. |
| V3 | Lighting that agrees with the sky | Build the environment map from the same cube with `PMREMGenerator` (in three core, no addon) and set it as `scene.environment`. Point the key light from the sky's sun. This is what stops ships looking pasted on. **Check** that hull and drone materials are standard PBR materials. |
| V9a | Exposure and bloom baseline | Choose one tone-mapping curve and one exposure, and retune bloom against the new sky. Every later story is judged at these settings. **Check** where tone mapping happens in the current composer chain. |
| G3 | Planet and black hole | Solar System Scope texture on the gas planet, a rim-glow atmosphere, and the sun's direction matching V3. |

## 7. Pass 2: things that move

**S0 first:** settings flags for reduce-flash and reduce-shake, read from `store.js`. Every effect below respects them from the day it is built.

| ID | Story | Notes |
|---|---|---|
| V4 | Bolt trails and muzzle flash | Pooled ribbons in one shared geometry (one draw call). Kenney flash sprite at the hardpoints, 2 frames long. |
| V5 | Explosions | Unity flipbook for the fireball, Kenney sparks with drag, an additive shockwave ring, and a brief light. All explosion quads go in one instanced mesh with a per-instance frame number. Lights come from a fixed pool of 2 that stay in the scene at zero intensity; changing the number of lights makes three.js recompile shaders and causes a hitch. |
| V6 | Hit-stop | 30–50 ms freeze of simulation time on charged hits, elite kills and boss-node hits. Audio and rendering keep running. No retrigger within 150 ms. Off under probes and under reduce-flash. |
| V7 | Engine plume | Animated jet scaled by throttle and boost, plus a soft glow sprite at the nozzle. |
| V2 | Space dust | One point cloud wrapped around the camera, stretching into streaks with speed. |

Watch fill rate in V5: a large additive explosion close to the camera is the most expensive thing this plan draws. Cap the number of explosion quads on screen and shrink them when they are near the camera.

## 8. Pass 3: sound

| ID | Story | Notes |
|---|---|---|
| A6 | Sampled sound effects | Keep the synth sounds for the sharp attack and layer the Kenney samples under them for body. Random pitch of ±5% and 2 or 3 variants per sound stop rapid fire sounding mechanical. Limit each sound type to 4 voices. |
| A2 | Sub-bass | A 40–80 Hz sine thump on explosions, crashes and boss hits. |
| A1 | Music | Cruise, combat and boss loops with 1.5 s crossfades, plus victory and death stings. Decode each loop into an `AudioBuffer` for a gapless loop. A 90 s stereo track is about 32 MB once decoded, so decode the next cue during the previous phase and release the old one. The procedural `music-seq.js` stays as the fallback if a decode fails. |
| A7 | The mix | A limiter on the master bus so stacked sounds cannot clip. Music drops 3 dB under explosions. |
| A3 | Low-hull muffle | Low-pass filter and heartbeat below 25% hull. |
| A4 | Spatial sound | Extend the existing Stage 6 panner to enemy fire, fly-bys and crashes. |

Choose the music file format from your supported browser list (D7 in the master plan) and listen to the loop seam in each browser. OGG support in Safari depends on the version, and MP3 leaves a gap at the loop point.

## 9. Pass 4: the cast

Every model swap keeps the existing collision sizes. The gameplay probes must pass unchanged; if one needs editing, the swap changed gameplay.

| ID | Story | Notes |
|---|---|---|
| G1 | Enemy ships | One kit model per class, with a distinct silhouette for gunner, rammer and elite. Keep the elite's amber tint. Add emissive engine and weapon trim so bloom picks them out. **Check** what `drone.js` builds today and how many draw calls a full wave costs. |
| G2 | Boss | Assemble from kit parts in Blender and export one GLB; do not merge meshes at runtime. Keep the three orbiting shield satellites, the core node and their hit volumes exactly where `boss.js` has them. |
| G2b | Boss states | Shield satellites glow while up. The core changes colour when vulnerable. Smoke flipbooks attach at 66% and 33% health. Death is a chain of explosions, one large shockwave, a white flash, slow motion and the victory sting. |
| V8 | Asteroids | 3 Poly Haven rock variants, decimated. The collision radius from story 7.5 must still enclose each mesh. |

## 10. Pass 5: chrome and final grade

| ID | Story | Notes |
|---|---|---|
| U1 | HUD skin | Kenney Sci-Fi frames as stretchable borders on the existing panels. Full-width boss bar with phase ticks. Same two fonts throughout. |
| U2 | Title and loading | Logo over the live scene with a slow camera move. Key-cap chips from Kenney Input Prompts replace the wall of text. A loading splash that paints before the large script parses. **Check** where the script tag sits in `index.template.html`. Favicon; remove the dev build chip. |
| U3 | Cards | Death, victory and pause cards share one style, with an animated score tally and a new-record flourish. |
| V9b | Final grade | Vignette, light film grain, and a sun flare made from an additive sprite (no new addon). Do this last, against everything else. |

## 11. How you judge it

Before Pass 1, add a probe that captures six fixed "beauty shots" from a fixed seed: title, cruise past the planet, the rift, mid-combat with six enemies, the boss firing a volley, and the death card. Capture them headed with the GPU on, because headless software rendering does not look the same.

After each pass the probe produces the same six shots, and you compare them side by side with the previous set. Each pass ends with:

- Full battery green, with the gameplay probes unchanged.
- Budget check within the cap; frame time recorded on the reference machine.
- Your verdict on the six shots, and on a listen for Pass 3.
- A tag and a `LEDGER.md` row.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Assets from different families clash | L1 decided first; one ship kit for the whole cast; anything that clashes is cut, however good it looks alone |
| Payload and boot time | Boot explained before starting (0.5); budget table enforced by the build |
| A licence problem once the repo is public | L3; manifest entry required for every shipped file |
| Frame rate drops | Frame time recorded per story; instanced effects; caps on explosion quads and lights |
| Model swaps change gameplay | Collision sizes fixed; gameplay probes must pass unedited |
| Decoded music uses too much memory | Decode one cue ahead, release the previous |
