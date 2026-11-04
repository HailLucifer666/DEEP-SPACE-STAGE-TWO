# GDD: Full 3D Flight (Stage 3 — stories 015 / 016 / 017)

> **Epic**: stage-3-full-3d-flight
> **Status**: Proposed (design source for story-015, story-016, story-017)
> **Approved scope line** (`one-shot-work/stage-2/PROGRESS.md` L78-79): "Stage 3 — full 3D flight (story-015 pitch+drift → 016 spherical arena → 017 world goes 3D)"
> **Grounding**: `design/game-brief.md`, stories 004/005/012/013/014, `src/combat.js`, `src/input.js`, `src/main.js`, `src/enemies.js`, `src/drone.js`, `src/boss.js`, `src/launch.js`, `src/phases.js`, `tools/flow-check.mjs`
> **Last Updated**: 2026-11-05

---

## 1. Overview

Stage 3 turns the combat ship from a turret with a thruster into a ship in space. Today the
player commands throttle (W/S) and yaw (A/D + pointer-X) on a flat plane at `ARENA_Y = 18`
(`src/combat.js` L18, L154); the ship flies exactly where the nose points
(`vel = forward · speed`, `src/combat.js` L186). Stage 3 adds **pitch** (a second commanded
rotation axis) and **drift** (velocity becomes a persistent vector that realigns toward the
nose instead of snapping to it — story-015), replaces the flat disc boundary with a **soft
spherical arena** using the same bleed feel as story-005 (story-016), and fills the combat
world with volumetric dressing so the sphere reads as a place rather than a math bound
(story-017). The whole design is a retune of existing systems: the drone already steers in
full 3D (`src/drone.js`), the boss charge is already a 3D dash (`src/boss.js` L169), the edge
pips and proximity scan already work in 3D (`src/combat.js` L519-527, L648-672), and
`input.mouse.y` is already recorded and unused (`src/input.js` L17, L58) — so pitch on the
pointer's Y axis needs **zero input.js changes**.

## 2. Player Fantasy

**What the player should feel**: the moment they first pull the nose up and the field drops
away beneath them — "oh, it's *space*". Before Stage 3 the arena is a floor you skate over;
after it, the arena is a volume you own. Concretely:

- **Sensation** (MDA): climbing over a raider ring and diving back through it; swinging the
  nose through a turn and feeling the hull carry momentum (the drift); the boost rush now
  having an up as well as a forward.
- **Challenge / Competence** (MDA / SDT): vertical escape becomes a real dodge — the boss's
  charge dash is already full-3D (`src/boss.js` L169), so climbing is a *counterplay* the
  game already technically supports; the drift adds a mastery layer to turning (cut the
  throttle mid-turn and the ship swings wide — brake and it scrubs straight).
- **Discovery** (MDA): the spherical arena rewards flying to places the flat build could not
  go — over the top of the fight, under the boss's orbit plane.
- **Pillar alignment** — "controls that FEEL right" (`design/game-brief.md` MVP 4) and
  "smooth, never stuck, obvious controls" (brief, closing section): pitch must be as obvious
  and as readable as A/D was in story-004. That drives three commitments below: a clamped
  pitch envelope (no disorientation), the same deadzone/clamp grammar as yaw, and controls
  text updated in both places it lives (CONTROLS panel, hint bar).

**Anti-fantasy (what we are NOT building)**: a 6-DOF Elite-style ship. No roll control, no
loops, no strafing. The nose stays player-owned yaw + pitch in a world-up frame; this is the
same deliberate simplification story-004 made for yaw, extended one axis.

## 3. Detailed Design

### 3.0 The keystone: `forward()` goes 3D

One function change propagates through almost everything. Today
`forward(out)` returns `(sin h, 0, cos h)` (`src/combat.js` L153-155). Its 3D form is
`(sin h · cos φ, sin φ, cos h · cos φ)` where `φ` is pitch (nose-up positive). Every consumer
gains the vertical component automatically and correctly:

| Consumer | Site | Effect of the 3D form |
|---|---|---|
| Ship velocity | `src/combat.js` L186 | flight follows the pitched nose (then drift, §3.2) |
| Player bolts | `src/combat.js` L226-229 | bolts fly where the pitched nose points |
| Chase cam | `src/combat.js` L603-607 | see §3.3 — one line must ALSO change (the look-target is pinned to `ARENA_Y`) |
| Probe spawns | `src/combat.js` L335-346, L371, L445 | probe entities still spawn "ahead of the nose" — deterministic because pitch = 0 at combat entry |

Ship pose: the pose group already uses `rotation.order = 'YXZ'` with `rotation.y = heading`,
`rotation.z = bank` (`src/combat.js` L88-90, L600-602). Pitch slots in as
`pose.rotation.x = −φ` (negative because with YXZ composition a positive rotation.x pitches
the +Z-forward nose DOWN; derivation: nose-in-pose-space is +Z via the tilt group's
`rotation.x = π/2`, L91-93; `R = RY(h)·RX(−φ)·RZ(bank)` applied to `(0,0,1)` yields
`(cos φ · sin h, sin φ, cos φ · cos h)`). Bank is the innermost rotation, so it stays a roll
about the nose axis and the banking visual remains correct at any pitch.

### 3.1 Pitch — command model and bindings (story-015)

Pitch mirrors the yaw grammar exactly (story-004's scheme, `src/combat.js` L165-168):

- **Pointer (primary)**: pointer offset above/below screen center steers pitch, deadzone
  0.08 NDC — identical to the yaw deadzone (L166). **Direct convention: pointer above
  center = nose up** (matches the direct yaw convention — pointer right steers right — and
  NMS's default). `input.mouse.y` is already NDC-up-positive and unused
  (`src/input.js` L17, L55-59). **Zero input.js changes.**
- **Keys (fallback)**: **R = pitch up, F = pitch down.** R/F are unused today (input.js
  routes only Space/P/Escape/M/Enter in combat, plus W/A/S/D/Shift/arrows as movement keys
  read in combat.js; N/T are the closed spin viewer, `src/input.js` L27-49). ArrowUp/Down
  stay throttle aliases (L174-175) — they do NOT become pitch.
- **Combined command**: `pitchCmd = clamp(keyPitch + pointerPitch, −1.25, 1.25)` — the same
  1.25× clamp story-004 applies to yaw (L167).
- **Rate and envelope**: `dφ/dt = pitchCmd · PITCH_RATE` (1.8 rad/s), clamped to
  `±PITCH_MAX` (72° = 1.257 rad). See Formulas for why 72°.
- **Invert knob**: `PITCH_INVERT = false` const — flips the pointer convention only (keys
  unaffected) if playtesting says direct feels wrong for a slice of players.

**Controls-text updates (forced)**: the CONTROLS panel text (`src/main.js` L62-66,
`PANEL_HTML.CONTROLS`) and the in-game hint bar in `tools/index.template.html` (its exact
current text: UNVERIFIED — not read; story-004's file list, L72-73, names it as the hint
bar's home) each gain one line: "R / F or MOUSE ↕ — pitch".

**What does NOT change**: W/S throttle semantics (cruise holds speed, S beats W, boost
raises the ceiling only — user-confirmed decisions recorded in story-004), Space/Shift =
boost (`src/input.js` L39), LMB fire, the pointerleave/blur stale-pointer clearing
(`src/input.js` L67-70 — pitch inherits it for free since it reads the same mouse state).

### 3.2 Drift — the momentum model (story-015)

Today `vel` is recomputed every frame as `forward · speed` (`src/combat.js` L186) — zero
inertia. Drift makes `vel` a **persistent state** that realigns toward the nose:

```
target = forward3D · C.speed
C.vel += (target − C.vel) · (1 − exp(−ALIGN_RATE · dt))     ALIGN_RATE = 4.5 /s
```

- **Drift has no input binding.** It is the physics of the existing throttle: the player
  experiences it as the ship swinging wide in a hard turn, coasting through a brake, and the
  camera trail (story-002, `src/combat.js` L603, driven by `vel.length()`) framing the
  actual motion rather than the commanded one.
- **Speed stays the throttle state** (`C.speed`, story-004/005 semantics). At steady state
  `vel → forward · speed`, so cruise-hold and brake asserts keep their meaning.
- **Ordering constraint (load-bearing)**: within `steer()`, drift alignment runs FIRST, then
  the boundary bleed, then integration — mirroring today's bleed-then-integrate order
  (`src/combat.js` L186-200). If alignment ever ran after the bleed it would undo the
  boundary's radial cap every frame.
- **The story-004 contract is retuned, explicitly**: "the ship flies where the nose points"
  becomes "the ship flies where the nose points *within a slip angle*". At full yaw command
  the steady-state slip is β ≈ 28° (Formulas §4.3). All story-004 flow-check asserts
  SURVIVE, because the turn-in-place probe runs at speed 0 (`enterCombat` resets
  `C.speed = 0`, `src/combat.js` L547; with `vel = 0` drift is inert — displacement stays
  < 3 u).
- Story-005's rim behavior survives: alignment pulls `vel` outward again each frame, but the
  bleed runs last in the frame, so the equilibrium radial speed is still the bleed cap and
  the rim-slide feel is unchanged (assert re-measured, AC 015-8).

### 3.3 Chase camera (story-015)

Two changes, both minimal:

1. **Look target**: today `camera.lookAt(pos.x + fwd.x·4, ARENA_Y, pos.z + fwd.z·4)`
   (`src/combat.js` L607) — pinned to the arena plane. Becomes
   `pos.y + 4·sin φ` for the y component (the pitched nose's rise/drop), x/z unchanged.
2. **Camera position**: `camTarget = pos − fwd3D·(7.5 + |vel|·0.22)` then `+3.4` **world** y
   (L603-604) — the formula survives as-is with the 3D forward. The +3.4 stays WORLD-up
   (deliberate: a ship-local up offset would need the up-vector handling of §5.1; world-up
   never inverts because we never pitch past 72°).

### 3.4 The 015 altitude band (scaffold, retired by 016)

Story-015 ships pitch while the boundary is still the flat disc — so a temporary soft
**altitude band** keeps the player in the fight volume, using story-005's exact feel:
outside `[ARENA_Y − 16, ARENA_Y + 16]` the vertical velocity component bleeds toward the
band with the same cap-and-floor formula (floor 3 u/s, the load-bearing anti-mud floor from
`src/combat.js` L194 / story-005 Implementation Notes), and a hard clamp at ±20 (the safety
net, L202-208's 3D analog). `#warn` ("EDGE OF SECTOR") fires outside the band — same
element, same grammar (`src/combat.js` L209-212). Story-016 deletes the band and its
asserts (documented retirement, §8).

### 3.5 The spherical arena (story-016)

- **Center** `O = (0, ARENA_Y, 0)` — the spawn point (`src/combat.js` L545). **Radius**
  `R_HARD = 80`, soft shell from `R_SOFT = 60` — the SAME numbers as the flat rim
  (`src/combat.js` L25), so crossing times and the spawn-ring math are unchanged.
- **Soft bleed (3D)**: with `r3 = |pos − O|` and outward normal `n = (pos − O)/r3`, the
  radial component of `vel` (`vel · n`) is capped at
  `max(3, MAX_SPEED · (R_HARD − r3) / (R_HARD − R_SOFT))` — story-005's formula with the 3D
  normal; tangential components preserved (slide along the shell, never pin).
- **Hard clamp**: past `R_HARD`, scale `pos − O` back to the shell (the `r > R_HARD` block
  at L202-208 gains its y term).
- **Visuals**: the existing equator rim ring stays (created once in `enterCombat`, L533-543)
  as the "ground reference"; its opacity driver (L213) switches from 2D proximity to 3D
  proximity. `#warn` fires entering the soft shell. A faint full shell surface is a
  **story-017** polish item (§3.6), not 016 — 016 changes the math, 017 changes the look.
- **Enemy spawns**: raiders spawn 55 off the player (`src/enemies.js` L84) — already can
  spawn outside the flat boundary and fly in (pre-existing accepted behavior); unchanged in
  the sphere. Drones orbit the player (§5.4). Boss exempt (§5.3).

### 3.6 World goes 3D (story-017)

Scope reading of "world goes 3D" (from the PROGRESS scope line): the combat *dressing*
becomes volumetric. The launch set-piece is untouched — the ship never leaves the lane in
pad/countdown/ignition/ascent (`src/launch.js` L5-7, L116-123), and those phases are closed.

- **Ambient combat field (the main item)**: today the combat-visible rocks are the lane
  stream — two instanced bands seeded radially 14-60 around the z-axis, recycled along a
  960-long band, streamed by `combatFlow(dt, flow)` at 3-29 u/s (`src/launch.js` L140-165,
  L245-258, L285-287). Those same groups serve the cruise, so they are NOT redistributed
  (that would rewrite the closed launch staging). Instead 017 adds a **combat-only ambient
  InstancedMesh** (~120 rocks) seeded in a spherical shell 25-75 u from O, created once in
  `prepareCombat`, shown in combat, hidden in `clearCombat` — the rim ring's exact lifecycle
  pattern (`src/combat.js` L533-543, L701). It rotates as a whole group slowly (~0.005 rad/s);
  no per-instance updates; no collision (the lane stream already has none).
- **Boundary shell visual**: a faint additive sphere at `R_HARD` (same material family as
  the rim ring and the rift planes — additive/transparent/`depthWrite:false`), opacity
  driven by 3D proximity exactly like the ring's driver (L213). Reads under the existing
  bloom chain (`src/main.js` L349-359, threshold 0.85) without new post work.
- **Backdrops stay**: planet (−95, 26, 260) and black hole (48, 10, 950) sit outside the
  sphere and read as deep-space backdrop (`src/launch.js` L168-177); the sphere is a flight
  bound, not a visible wall. Stars are already a full-sphere distribution — "there is no
  horizon any more" (`src/launch.js` L126-137) — correct at any altitude, zero change.
- **Edge pips** already project full-3D (`src/combat.js` L648-672) — zero change; they
  simply start being useful above the plane.

### 3.7 Closed surfaces — what full 3D forces, item by item

| Closed surface | Verdict | Forced interaction |
|---|---|---|
| Boss fight state machine (`src/boss.js`) | Keep | Orbit/altitude-follow/volley all survive (§5.3); ONE guard added: the charge dash target is clamped inside the sphere so the overshoot (10 u, `OVERSHOOT`, boss.js L49) can never carry the boss out of it. Phase thresholds, weak point, slow-mo death untouched. |
| Victory card (`src/phases.js` L98-113, story-014) | Keep | Zero interaction — the card reads `C.time` and score, both pitch-agnostic. `bossDefeated` path untouched (`src/combat.js` L110-121). |
| Drone steering architecture (`src/drone.js`) | Keep — RETUNE only | Already full-3D by design ("Stage 3 retunes it instead of rewriting it", story-012). Retune = verify only: ring y ∈ player ± 6 (`Y_AMP_MAX`, drone.js L27) and the 3D dive homing (L199-220) already work in the sphere. No code change required; one assert keeps `droneProbe.yRange > 1`. |
| Music/SFX (`src/audio.js`) | Keep | Nothing forced. (An engine-pitch shift with pitch rate would be nice — explicitly out of scope.) |
| Bloom pipeline (`src/main.js` L349-359) | Keep | The 017 shell uses the rim ring's material grammar, already proven under bloom. |
| SPD readout (`src/phases.js` L159-176) | Keep semantics | `SPD` keeps showing `C.speed` — the **commanded** airspeed along the nose. With drift, actual motion diverges from it; the camera trail shows the difference (story-002 trail tracks `vel.length()`), and `combatState()` gains `velMag` so the harness (and any future HUD) can show true speed. Rationale: TD-014's contract ("the SPD line is combat's write") and story-010's writer shape stay intact; changing semantics to |vel| is a one-line flip left as a decision (§8, player decision 2). |
| Launch phases (pad→ascent, `src/launch.js`) | Keep | Zero touch. Story-017 adds only combat-side dressing. |

## 4. Formulas

All angles in radians unless shown otherwise. `h` = heading (player-owned world yaw),
`φ` = pitch (nose-up positive), `O` = arena center `(0, ARENA_Y, 0)`, `ARENA_Y = 18`.

### 4.1 Forward vector and pose

```
forward3D = (sin h · cos φ, sin φ, cos h · cos φ)
pose.rotation.y = h ;  pose.rotation.x = −φ ;  pose.rotation.z = bank   (order 'YXZ')
```
Example: h = 0, φ = 30° → forward = (0, 0.5, 0.866); the nose points 30° above the +z axis.

### 4.2 Pitch integration

```
pitchCmd = clamp((R ? +1 : 0) − (F ? +1 : 0) + (PITCH_INVERT ? −my : my)_dz, −1.25, 1.25)
my_dz = (|mouse.y| > 0.08) ? mouse.y : 0
C.pitch = clamp(C.pitch + pitchCmd · PITCH_RATE · dt, −PITCH_MAX, +PITCH_MAX)
PITCH_RATE = 1.8 rad/s ;  PITCH_MAX = 1.2566 (72°)
```
Example: hold R for 0.4 s → Δφ = 0.72 rad (41°). A full 0→72° pull takes 0.70 s — slightly
slower than yaw's full circle (3 s at 2.2 rad/s ≈ 2.86 rad/s effective... yaw turns 360° in
2.86 s; pitch sweeps its whole envelope in 0.70 s), so pitch feels quick but bounded.

### 4.3 Drift (velocity alignment)

```
target = forward3D · C.speed
C.vel += (target − C.vel) · (1 − exp(−ALIGN_RATE · dt))     ALIGN_RATE = 4.5 /s
```

- **Steady-state slip angle** at sustained yaw command ω (= TURN_RATE · turnCmd):
  `β = 2 · asin(ω / (2 · ALIGN_RATE))`.
  Full turn (ω = 2.2): β = 2·asin(2.2/9.0) = 0.494 rad ≈ **28°** — pronounced, readable
  drift. Gentle pointer steer (ω ≈ 0.5): β ≈ 6°. Boost does not change β (alignment is
  rate-based, speed-independent); it scales the slip *distance*.
- **Recovery time**: after a full-slip release, `vel` is 95% realigned in
  `3/ALIGN_RATE ≈ 0.67 s`.
- **Measured path radius** in a sustained full turn grows from the flat baseline
  7.7 u (story-004 r2 review, cited in story-013) to ≈ 9-11 u — the drift tax on tight
  turns, and the number the 015 assert enforces.
- **Climbing turns tighten the ground track** (yaw rotates the horizontal component only):
  `r_ground = speed · cos φ / TURN_RATE`. At φ = 60°, speed 17: 17·0.5/2.2 ≈ 3.9 u.

### 4.4 Soft boundary (3D, story-016; 1D band variant for 015)

```
r3 = |pos − O| ;  n = (pos − O) / r3
radial = vel · n
cap(r3) = max(3, MAX_SPEED · (R_HARD − r3) / (R_HARD − R_SOFT))
if radial > cap: vel −= (radial − cap) · n            // tangential preserved
if r3 > R_HARD: pos = O + (pos − O) · (R_HARD / r3)   // hard safety net
R_SOFT = 60, R_HARD = 80, floor = 3 u/s
```
Examples: at r3 = 70 the outward cap is 8.5 u/s; the soft shell is 20 u thick →
1.2 s to cross at cruise 17, 0.62 s at boost 32.3. The floor 3 is story-005's
bounded-arrival finding (the pure linear cap is asymptotic and reads as mud —
`src/combat.js` L194 comment and story-005 Implementation Notes) — carried into 3D
unchanged.

015 band variant: replace `r3/R_HARD/R_SOFT` with `d = |y − ARENA_Y|`, band soft at
`BAND_H = 16`, hard at `BAND_HH = 20`, normal ±ŷ — same cap/floor formula.

### 4.5 Boundary interplay with drift (ordering)

Per frame inside `steer()`: (1) pitch/yaw integrate; (2) drift alignment moves `vel`
toward `forward3D · speed`; (3) boundary bleed caps the radial component; (4) integrate
position; (5) hard clamp. Because (3) runs after (2), the boundary always wins within one
frame and the equilibrium radial speed equals `cap(r)` — the rim-slide feel is preserved
exactly (AC 016-2 re-measures story-005's numbers in 3D).

## 5. Edge Cases

### 5.1 Near ±90° pitch — the camera up-vector
Unreachable by design. `PITCH_MAX = 72°` clamps before the world-up `(0,1,0)` chase camera
degenerates: the camera's lateral basis magnitude is `cos φ` (≥ 0.31 at 72°), so `lookAt`
stays well-conditioned and the horizon never rolls. A full-loop 6-DOF model (quaternion
orientation, ship-local camera up) would rewrite the pose/cam block and the entire
heading-owned contract of story-004 — rejected on smallest-change bias. **Consequence to
state plainly: the ship can never loop.** Vertical maneuvering is a 144° cone (±72°).
Accepted; revisiting requires a design-level reopen, not a tuning knob.

### 5.2 Drift vs thrust interplay
- **Turn at speed**: ship points up to 28° inside its path (§4.3) — the swing is the feature.
- **Brake mid-turn**: S drives `speed → 0`; the target velocity collapses and `vel` scrubs
  out along the old direction over ~0.7 s — a handbrake feel. BRAKE 22 (`src/combat.js`
  L30) is unchanged; alignment adds the exponential tail.
- **Boost expiry**: the R2-1 bleed-order fix (story-004 addendum: brake → expiry-bleed →
  accelerate, L180-182) operates on `speed`, orthogonal to drift — survives untouched.
- **Turn in place**: at `speed = 0`, target = 0 and vel stays 0 — story-004's < 3 u
  turn-in-place assert is untouched (probe precondition: entry speed is 0, L547).
- **Pointer parked off-deadzone**: the R2-2 stale-pointer clear (`src/input.js` L67-70,
  L87-88) covers pitch identically (same mouse state object).

### 5.3 Boundary interplay with boss charge attacks
The boss is exempt from the boundary — `src/boss.js` contains no R_SOFT/R_HARD reference,
and its orbit y-lerp (L323) plus 3D dash (L169) keep it effectively player-anchored. The one
real hazard: the charge dash overshoots 10 u past the captured target (`OVERSHOOT`,
boss.js L49); a player hugging the shell could bait a dash that exits the sphere. **Fix
(one line, story-016)**: clamp the captured `dashTarget` radially to
`r3 ≤ R_HARD − OVERSHOOT − 2 = 68` inside `launchDash` (boss.js L164-176). The dash stays
inside, the overshoot stays honest, and the state machine is otherwise untouched. Volley
bolts stay flat (`dir.y = 0`, boss.js L155) — the boss's altitude-follow (rate 3/s, L323)
converges onto the player's altitude in ~1 s, so flat bolts remain threatening; climbing is
a dodge against volleys, but NOT against the charge (which climbs with you) — the intended
anti-camp balance.

### 5.4 Drones (and raiders) vs the new boundary
- **Drones**: exempt. They orbit the PLAYER at r 12-20 (`src/drone.js` L27-28), so a player
  at the shell puts ring points up to ~100 u from O — the drone overshoots the shell by up
  to ~20 u while seeking its ring point, then comes back. Visually acceptable (additive
  sprites, no wall to clip); documented accepted behavior. Optional knob
  `DRONE_SHELL_CLAMP` (default off) if playtesting objects. No steering rewrite — this is
  the story-012 contract honored ("retunes it, never rewrites").
- **Raiders — the altitude-camping hazard (the sharpest new edge case)**: raider steering is
  XZ-only (`dist = hypot(dx, dz)`, `src/enemies.js` L132-134, L156-157, L175-176) and
  `lookAt` is yaw-only (L158, L177). They spawn AT the player's altitude (L84) but then
  never change y — once the collision scans go 3D (below), a player who climbs 40 u strands
  every raider below and trivializes the wave. **Retune (story-015, one line per raider
  tick)**: `d.position.y += (playerPos.y − d.position.y) · (1 − exp(−RAIDER_ALT_FOLLOW ·
  dt))`, `RAIDER_ALT_FOLLOW = 1.2 /s` — the boss's own altitude-lerp pattern (boss.js L323)
  at quarter rate, so raiders trail altitude changes and staying mobile still buys windows
  of safety.
- **Collision scans that MUST go 3D in story-015** (they are XZ-only today and become wrong
  the moment a y-difference can exist):
  - enemy bolt × player hit: `dx² + dz² < 1.4` (`src/enemies.js` L113-114) — a bolt 30 u
    above the ship would still "hit";
  - player bolt × raider: `dx² + dz² < 1.1` (`src/combat.js` L239-253);
  - raider ram contact: `dist < R_RAIDER + 0.9` with XZ dist (`src/enemies.js` L179).
  Each converts to the full-3D squared-distance form already proven by the drone scan
  (`src/combat.js` L254-270). Raider `lookAt` stays yaw-only (visual only).

### 5.5 Existing flat-plane tuning constants — disposition table

| Constant | Site | Disposition |
|---|---|---|
| `ARENA_Y = 18` | combat.js L18 | Stays; re-anchored as the sphere center's y (O). Camera look-pin to it is REMOVED (§3.3) — the one place it stops being a floor. |
| `R_SOFT = 60, R_HARD = 80` | combat.js L25 | Values kept; meaning widens from disc to sphere (016). 015 adds `BAND_H/BAND_HH` as a scaffold, deleted in 016. |
| floor 3 u/s | combat.js L194 | Carried into 3D unchanged (bounded arrival). |
| `MAX_SPEED 17, BOOST_MULT 1.9, ACCEL 14, BRAKE 22, TURN_RATE 2.2` | combat.js L26-30 | All unchanged — throttle model untouched by design. |
| rim ring visual | combat.js L533-543 | Stays at the equator as ground reference; opacity driver goes 3D (L213). |
| story-004 asserts | flow-check | Turn-in-place / W-holds-nose / S-brakes / cruise-holds / boost-bleed / pointer-leave all keep passing unchanged (they are speed-state or zero-speed probes). |
| story-005 boundary asserts | flow-check (probes 7/7b/8) | Re-measured in 3D in 016 (`r = hypot(x,z)` → `r3`); the 015 band asserts are NEW in 015 and RETIRED in 016 — the retirement is stated in the 016 story, not silent. |
| scriptedKill probe bolt at `ARENA_Y` | combat.js L342 | Probe-only; still valid (pitch = 0 in its 0.4-1.4 s window). Note in the 015 report. |
| `C.speed` in `combatState()` | combat.js L716 | Unchanged; gains siblings `pitch` and `velMag`. |

### 5.6 Other edges
- **Combat entry reset** gains `C.pitch = 0` next to `heading/bank/speed` (`enterCombat`,
  `src/combat.js` L547) — §8.6 contract: a replay never inherits a nose-up start. `vel`
  also resets (L546 already zeroes it).
- **Death slow-mo**: pitch/drift run on scaled dt like everything else (L583 comment) — no
  special case. The victory card is unaffected (C.time, score).
- **Sphere + drifting rim slide**: holding W outward at the shell with an oblique heading —
  alignment keeps feeding radial speed, the bleed caps it, tangential preserved — slides
  along the shell exactly as story-005's rim does on the disc (AC 016-3).
- **Firing while pitched**: bolts spawn from `noseWorld` (L149-151, rides the pose) and fly
  along the pitched forward — a +45° shot visibly climbs (AC 015-6). No aim-convergence
  system is added; the reticle stays a steering reference, not an aim point (unchanged
  story-004 model).
- **`build/flow-check.mjs`** (named in the dispatch) does not exist — the harness is
  `tools/flow-check.mjs` (verified: read attempt on `build/flow-check.mjs` errors; the file
  at `tools/flow-check.mjs` carries the assert grammar). All ACs below target that file.

## 6. Dependencies

**Direction of data flow**: input (`src/input.js`, read-only) → `steer()` in
`src/combat.js` → pose/camera/effects → enemies/drones/boss ticks consume `C.pos`.

**Story-015 (pitch + drift)** touches:
- `src/combat.js` — `C.pitch` state; `forward()` 3D; steer() pitch/drift/band; camera
  look-target; `enterCombat` reset; `combatState()` gains `pitch`, `velMag`; a
  `?pitchProbe=1` deterministic drive (droneProbe pattern, L366-409) reporting
  `{ dPhi, slip, driftPath, boltRise, band }`.
- `src/enemies.js` — 3D collision scans (3 sites, §5.4); altitude-follow line.
- `src/main.js` (`PANEL_HTML.CONTROLS`, L62-66) + `tools/index.template.html` (hint bar —
  UNVERIFIED text; location per story-004 file list).
- `tools/flow-check.mjs` — new asserts (AC 015), existing 76 keep green
  (`one-shot-work/stage-2/PROGRESS.md` L77: "flow-check 28 → 76 asserts").

**Story-016 (spherical arena)** touches:
- `src/combat.js` — bleed/clamp blocks go 3D (§4.4); band scaffold deleted; rim opacity 3D;
  boundary probe rewrite.
- `src/boss.js` — the ONE added line: `dashTarget` shell clamp (§5.3).
- `tools/flow-check.mjs` — boundary asserts re-measured in 3D; 015 band asserts retired.

**Story-017 (world goes 3D)** touches:
- `src/combat.js` (or a small `src/arena-dressing.js` if the programmer prefers) — ambient
  field + shell visual, rim-ring lifecycle pattern.
- `tools/flow-check.mjs` — presence/opacity asserts.
- `src/launch.js` — NOT touched (closed cruise). `src/phases.js`, `src/audio.js` — not
  touched.

**Provides / requires contract**: 015 provides `combatState().{pitch, velMag}` and the
pitchProbe surface; 016 requires them (its asserts read 3D radius + pitch). 016 provides
the sphere; 017 requires only `O`/`R_HARD`. Nothing downstream (boss, victory, waves)
consumes pitch — they consume `C.pos`, whose 3D form they already handle.

## 7. Tuning Knobs

Project convention: named constants in the owning module's header (story-013: "all named
constants in src/boss.js"; `src/drone.js` L22 "tuning knobs live here") — this overrides the
generic assets/data default for this codebase.

| Knob | Initial | Range | Category | Lives in | Rationale |
|---|---|---|---|---|---|
| `PITCH_RATE` | 1.8 rad/s | 1.2-2.4 | feel | src/combat.js | Slightly slower than yaw (2.2) — pitch is for posture, yaw for aiming. |
| `PITCH_MAX` | 72° (1.2566) | 60-80° | feel | src/combat.js | Up-vector safety (§5.1) + keeps the horizon readable; 72° caps the basis jitter. |
| `PITCH_INVERT` | false | bool | feel | src/combat.js | Direct matches the yaw convention and NMS default; cheap escape hatch. |
| `PITCH_DEADZONE` | 0.08 | 0.05-0.15 | feel | src/combat.js | Mirrors the yaw deadzone (L166) exactly. |
| `ALIGN_RATE` | 4.5 /s | 2-10 | feel | src/combat.js | Slip 28° at full turn = present drift without ice-rink. ≥ 99 effectively disables drift. |
| `BAND_H` / `BAND_HH` | 16 / 20 | 12-24 / H+4 | gate | src/combat.js | 015 scaffold only — sized so the band holds the fight near the raider plane; deleted in 016. |
| `R_SOFT` / `R_HARD` | 60 / 80 | ±20% | curve | src/combat.js | Story-005 values kept: spawn ring 55 stays off-camera, crossing times identical. |
| boundary floor | 3 u/s | 2-5 | feel | src/combat.js | Story-005's anti-mud floor — pinned by the rim-slide probe. |
| `RAIDER_ALT_FOLLOW` | 1.2 /s | 0.6-2.5 | feel | src/enemies.js | Anti-camp; quarter of the boss's 3/s so raiders trail, not teleport. |
| boss dash shell margin | 2 u | 1-4 | gate | src/boss.js | `R_HARD − OVERSHOOT − margin = 68` clamp on `dashTarget`. |
| `DRONE_SHELL_CLAMP` | off | bool | feel | src/drone.js | Default off (§5.4 accepted overshoot); on clamps ring points to R_HARD − 2. |
| shell visual max opacity | 0.18 | 0.1-0.3 | feel | src/combat.js (017) | Faint — the ring and #warn carry the warning; the shell confirms. |
| ambient field count | 120 | 80-200 | feel | src/combat.js (017) | One InstancedMesh; static within a slowly rotating group. |

## 8. Acceptance Criteria

Machine-checkable criteria are phrased for the `tools/flow-check.mjs` grammar
(`ok(name, cond, extra)` with `J()`/`poll()` on `window.__stage2` —
`tools/flow-check.mjs` L28-32, L76-88). Tolerances assume the fixed-knob build.

### 8.1 Story-015 — pitch + drift

- [ ] `?pitchProbe=1` reports `pitchProbe` on `window.__stage2` (droneProbe parity,
      `src/combat.js` L407 pattern); `combatState()` exposes `pitch` and `velMag`.
- [ ] Holding R for 0.4 s at zero throttle changes pitch by 0.72 rad ± 0.05; heading
      change |Δh| < 0.02 (axes independent).
- [ ] Pointer at NDC y = +0.8, no keys → pitch increases ≥ 0.5 rad in 1.0 s; NDC −0.8
      mirrors negative; pointer at |y| ≤ 0.08 → |Δpitch| < 0.02 over 1.0 s (deadzone).
- [ ] Sustained R for 1.5 s → pitch == PITCH_MAX ± 2° and never exceeds it; F mirrors.
- [ ] Drift: after a 1.0 s full yaw command at cruise (speed 17 ± 1), the angle between
      `forward3D` and `vel` is 20°-35° (slip present), and `velMag` ≥ 0.9 · speed.
- [ ] Drift recovery: 0.8 s after releasing the turn command, the slip angle is < 8°.
- [ ] Sustained full-turn circle at cruise traces radius 8.5-11.5 u (flat baseline 7.7,
      story-004 r2) — sampled from `combatState().pos` over one full revolution.
- [ ] Keep-passing: turn-in-place displacement < 3 u; cruise-hold ± 2 u/s; S brakes ≤ 3
      u/s; boost expiry bleed ≤ 25 u/s²; pointer-leave stops steering (story-004 set).
- [ ] Bolt fired at pitch +45° ± 5° rises: bolt y increases > 5 u over 0.5 s while xz-speed
      ≈ `BOLT_SPEED · cos φ`.
- [ ] Altitude band: flying straight up at full pitch + W, `|pos.y − 18|` never exceeds
      20.5; vertical speed ≤ 13 u/s measured in the 16-20 band (story-005 parity numbers);
      `#warn` visible when outside the band.
- [ ] Raider scans 3D: probe spawns a raider 20 u directly above a stationary ship → no ram
      contact and no bolt hit within 2 s (was: XZ-only test would hit).
- [ ] Raider altitude-follow: player teleports to +30 altitude for 3 s → live raider mean y
      within 12 u of the player's (retune measurable via `?droneProbe`-style sampling).
- [ ] Full flow-check green (76 existing + new), `CONSOLE []`; restartProbe clean; pitch
      resets to 0 on every `enterCombat`.

### 8.2 Story-016 — spherical arena

- [ ] Ship position never exceeds r3 = 81 from O under any input combination, including
      pitched flight at boost (hard clamp); the soft force engages at r3 > 60.
- [ ] Radial speed bleeds inside the soft shell: ≤ 13 u/s measured across r3 65-78 while
      holding W outward (story-005's measured parity, 8-shell-sample analog).
- [ ] The shell slides: at r3 = 79 with oblique heading + W, the ship carries > 5 u along
      the shell in 1.6 s (no pin — story-005 rim-slide in 3D).
- [ ] `#warn` fires entering the soft shell and clears inside it; equator rim ring opacity
      tracks 3D proximity (0 at r3 ≤ 60, > 0 at r3 ≥ 78).
- [ ] Boss dash guard: with the player parked at r3 = 78 during charge phase, every captured
      `dashTarget` satisfies r3(dashTarget) ≤ 68; the boss never exceeds r3 = 80 + OVERSHOOT
      tolerance (80 + 12) mid-dash and re-orbits inside.
- [ ] Drones remain functional in the sphere: `?droneProbe=1` still reports
      `yRange > 1`, `path3d` all-axes movement, telegraph/dive/contact true (story-012
      keep-passing — zero steering changes).
- [ ] 015 band asserts are REMOVED and the removal is stated in the story report (no silent
      retirement); `BAND_H/BAND_HH` consts deleted.
- [ ] Full flow-check green, `CONSOLE []`; restartProbe clean (restart baseline includes no
      new allocations — §8.6).

### 8.3 Story-017 — world goes 3D

- [ ] Combat-only ambient field present: probe reports ≥ 100 ambient rock instances whose
      positions fill the shell (min radial distance from O ≥ 25, max ≤ 75, sampled); the
      group is hidden on `clearCombat` and re-shown on `enterCombat` (rim-ring lifecycle).
- [ ] The field never collides or obscures: no ambient instance within 10 u of the ship over
      a 10 s probe drive at varied pitch (clearance analog of the lane stream's 14 u,
      `src/launch.js` L141-142).
- [ ] Shell visual: a sphere mesh at R_HARD exists in combat only, additive/transparent,
      opacity > 0 at r3 ≥ 78 and == 0 at r3 ≤ 60.
- [ ] Cruise untouched: all existing pad/countdown/ignition/ascent/transition flow-check
      asserts keep passing unchanged; `streamTick` groups and seeding unmodified (diff
      review: no `src/launch.js` change in the story's file list).
- [ ] Backdrops intact: planet and black hole remain visible from a high-altitude vantage
      (screenshot assert, manual player gate — collected at stage close per the full-auto
      grant convention used by stories 013/014).
- [ ] Experiential (playtest, 3+ runs): a player can find and dodge the boss charge by
      climbing; rim approach is noticed BEFORE the clamp (warn + ring + shell all seen);
      pitch never produces reported disorientation at 60°+; drift reads as weight, not lag
      (no "the ship ignores my input" reports).

### 8.4 Experiential criteria (cross-story, playtest gate)

- First-climb moment: within 30 s of a new player's first combat, they pitch at least once
  unprompted (hint bar + panel text did the job — the "obvious controls" pillar).
- The boss fight's character changes, not its shape: orbit → charge → rage phase order and
  timings unchanged (story-013 asserts keep passing), but verticality shows up as new
  player-driven dodges, not as new boss behavior.
- Failure recovery unchanged: death → slow-mo → card → REPLAY loop identical (story-014
  asserts keep passing).
