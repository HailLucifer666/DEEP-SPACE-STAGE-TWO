# Game Brief: STAGE TWO

**One-sentence pitch:** A cinematic browser space-brawler where you drift through asteroid fields, punch through a rift into a warp, and fight escalating waves of raider ships with mouse-aim and boost-flows — built on Vi3W models for a studio showcase.

## Core loop
- Launch: drift → prep → ignition → the cruise (streaming asteroids, planet, black hole) → rift → warp → logo → combat.
- Combat: W/S throttle (cruise holds speed) + A/D turn + mouse steer + LMB fire; kill gunners (hold range, shoot dodgeable bolts) and rammers (dive).
- Progress: waves escalate (count, speed, gunner share) for score + wave bonus; die → death card → REPLAY LAUNCH or SKIP TO COMBAT; record persists.

## Player goal & fail state — what "working" looks like
- Goal: survive and score across escalating waves (wave N cleared → bonus; record tracked on the title screen).
- Fail: ship destroyed (HP 100 + shield 50, regen after 3 clean seconds) → slow-mo → SHIP LOST card → replay or skip. "Working" = the full launch→warp→combat→death→retry loop is always reachable, never stuck on an overlay.

## MVP — what must exist to be the game
1. Cinematic launch (cruise → rift → warp → logo) with the Vi3W hero ship.
2. Arena combat: gunners + rammers, dodgeable enemy bolts, edge threat pips.
3. Death-retry loop (death card works from every path: REPLAY and SKIP).
4. Controls that FEEL right: W accelerates, S brakes, A/D turn the nose, mouse steers — the ship flies where it points (story-004); Space boost rushes the field.
5. Meta: high score persist + arm-confirm reset; sound toggle.
6. Pro title screen (panels, chrome) and honest HUD.
7. Evidence harness: CDP smokes + death-card click matrix + flow-check (paths never regress).

## Out of scope — not building this
- Boss fight until Vi3W boss model arrives (P0, waiting on assets).
- Bloom/post-fx pass; SFX/music until the Kenney handoff lands; public deploy/README (next after this fix round).
- No Burster/Elite/powerups/leaderboard/touch controls/settings page.

## Build order
1. Fix the two BLOCKING feel defects + path harness (overlay sweep, WASD velocity-trail cam, flow-check).
2. Vi3W drone + boss models → boss fight + victory card.
3. SFX/music handoff; bloom; README + public link.

---
**Who it's for / what they feel:** a studio interviewer / showcase player who should feel "a senior shipped this" — smooth, never stuck, obvious controls.

**Art & audio direction:** procedural deep-space neon (additive glows, cold cyan/warm red), Orbitron/Rajdhani UI, synth SFX (Kenney CC0 pending).

**Reference game:** the 10% of it the MVP keeps — classic twin-stick arena + cinematic set-piece launches (Nova Drift / FTL's warp moments); no meta-progression, one loop.
