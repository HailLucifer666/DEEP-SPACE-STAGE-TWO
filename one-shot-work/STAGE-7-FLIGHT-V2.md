# STAGE 7 — FLIGHT & WORLD v2 (the "NMS feel" plan)

> **Read this file before any Stage 7 task.** It is the anti-drift contract: one story per
> session, allowed files pinned, red-first asserts named, sanctioned rewrites recorded here
> so nobody loosens a bound quietly.
>
> **Provenance:** owner-directed 2026-11-09 (this conversation IS the owner decision record).
> Grounded in a full read of `src/combat.js`, `src/aim-assist.js`, `src/weapons.js`,
> `src/probes.js`, `src/enemies.js`, `src/powerups.js`, `src/store.js`, `src/input.js`,
> `tools/flow-check.mjs`, `docs/architecture.md`, `graphify-out/` (765-node graph, no cycles).
>
> **Owner decisions (RESOLVED, do not re-open):**
> - **D-7.1 — Flight assist defaults ON, `Z` toggles it.** FA-off is the skill ceiling, never the default.
> - **D-7.2 — The spherical arena STAYS as the boss room.** R_SOFT/R_HARD clamps become
>   boss-fight-only; the open world lives outside them. This preserves the boss's shell-guard
>   design (story-016 dash clamp, bossProbe pole scenario) and its ~15 asserts.
>
> **Supersessions (recorded, never quiet):** story-015 `PITCH_MAX` (±72° envelope) is
> superseded by 7.1; story-016 "sphere = the whole arena" is superseded by 7.3 (sphere =
> boss room); GDD full-3d-flight §5.1 "no loops, ever" is reopened by the owner. Each
> supersession lands in the story that needs it, with dated provenance in the assert rewrite.

## 0. Relationship to LAUNCH-10-10 (W4–W7)

LAUNCH-10-10's critical path (W4 settings → W5 stage close → W6 ship → W7 release) is NOT
cancelled — it is reordered behind Stage 7 by owner direction. The 10/10 scorecard still
gates the eventual release. If a release must happen before Stage 7 completes, the game is
shippable at any story boundary (every story is independently green + taggable).

## 1. Mission and the feel contract (numeric, not adjectives)

**Mission:** make the ship feel owned by a 40-year veteran — free 6DOF flight, real
momentum, an open volume instead of a walled bowl, encounters that emerge from the world —
with zero new art assets and no physics-engine dependency.

**The feel contract — every line is an assert or a measured playtest item:**

| # | Feel target | Number | Proven by |
|---|---|---|---|
| F1 | Full pitch loop | 360° in ≤ 4.3 s (85°/s) | flightProbe assert |
| F2 | Roll is real | 360° in ≤ 2.3 s (160°/s); horizon NOT level-locked | flightProbe + screenshot |
| F3 | Yaw 180° | ≤ 1.9 s (100°/s), pointer+keys combined ≤ 1.25× | flightProbe |
| F4 | Input latency | commanded ω reaches 63% in ≤ 0.12 s | flightProbe (ANG_SMOOTH) |
| F5 | FA-off momentum | keys released 1 s → speed retains ≥ 98% | flightProbe |
| F6 | FA-on forgiveness | steady full-yaw slip ≤ 30°; converges < 8° within 0.8 s of release | pitchProbe rewrite |
| F7 | Camera roll-follow | camera reaches 63% of ship roll in ~0.25 s; never degenerates (basis guard) | flightProbe |
| F8 | Speed FOV | 62 → 74° across the speed band, monotone with |vel| | flightProbe |
| F9 | Open space | free flight passes the old R_HARD with no clamp; outer shell at 3000 u bleeds | flow-check rewrite |
| F10 | Pulse drive | 0 → 240 u/s in ≤ 3 s; cancelled by damage same-frame | flightProbe |
| F11 | Heat encounters | kill → heat +1; thresholds 3/6/9 spawn patrol/wing/warden exactly once per crossing | heatProbe |
| F12 | Discovery | scan reveals N POIs; catalogue survives reload (store.js) | scanProbe |

**Feel verdicts are HUMAN.** Machine gates prove the numbers; the "does it feel like NMS"
verdict is the owner's, per the standing GATE precedent (stage-6: feel verdicts owed).

## 2. Laws (carry-over + new — bind every story)

1. All standing repo laws hold: one writer, lock file, red-first, never weaken an assert
   without a dated sanctioned rewrite, `index.html` is build output, show raw output,
   never claim a visual result (screenshots to `build/shots/`).
2. **NO-BALANCE:** 7.1–7.3 touch ZERO damage/HP/score/drop/wave-table numbers. Speed
   ceilings, fire rates, drop chances stay exactly as shipped. Balance work is 7.4+ and
   telemetry-driven only.
3. **NO-NEW-DEPS:** no physics engine, no addons beyond the existing 5 in `lib-entry.js`.
4. **restart-clean (§8.6):** every new C field (orientation, ω, FA state, heat, pulse,
   strafe, scan) is zeroed/identity in `enterCombat` and drained in `clearCombat`.
5. **Per-frame allocation:** zero new allocations in the tick path (scratch vectors hoisted,
   the existing `C.tmp` discipline — and never clobber `C.tmp`/`C.tmp2` across seams).
6. **Import direction (dep-check):** `flight.js` is a LEAF (imports stage-two-lib only).
   combat.js imports it; nothing imports flight.js except combat.js. No cycles.
7. **Honesty law:** every new HUD element renders harness-readable state.
8. **Element budget:** one meaning per element (reticle/pipper/bracket/pips unchanged).

## 3. The flight body — architecture contract

### 3.1 New module `src/flight.js` (LEAF)

Owns: orientation quaternion, angular velocity, the derived heading/pitch the harness
reads, the camera quaternion target, and (7.2) the velocity model. combat.js keeps owning
`C` and calls flight through a seam, exactly like `initWeapons`/`initAimAssist`.

```js
// src/flight.js — LOCAL AXES: nose = +Z, ship-up = +Y, ship-right = +X (screen-left at
// heading 0 — matches the shipped steer() sign map). q is the POSE quaternion: combat.js
// assigns it to C.pose.quaternion directly; the inner tilt group (rotation.x = π/2, +Y
// nose → +Z forward) is UNTOUCHED.
import { THREE } from 'stage-two-lib';
export const FLIGHT = {
  YAW_RATE: 1.75, PITCH_RATE: 1.48, ROLL_RATE: 2.79, // rad/s = 100/85/160 °/s (F1–F3)
  ANG_SMOOTH: 10,        // 1/s commanded→actual ω (F4: 63% in 0.1 s), dt-scaled exp
  CAM_ROLL_FOLLOW: 0.4,  // camera follows 40% of roll twist (F7)
  CAM_POS_K: 5, CAM_ROT_K: 6,
  FOV_BASE: 62, FOV_SPEED_GAIN: 12, // F8
  FA_DAMP: 4.5,          // FA-on nose-channel alignment = today's ALIGN_RATE (F6)
  STRAFE_A: 9,           // u/s² lateral thrusters
};
const q = new THREE.Quaternion();  // orientation (also the exported read surface)
const w = new THREE.Vector3();     // actual angular velocity, LOCAL axes (rad/s)
const dq = new THREE.Quaternion(), eu = new THREE.Euler();
export function orientTick(dt, cmd) { // cmd = { yaw, pitch, roll } ∈ [-1.25, 1.25]
  const k = 1 - Math.exp(-FLIGHT.ANG_SMOOTH * dt);
  w.x += (-cmd.pitch * FLIGHT.PITCH_RATE - w.x) * k; // NEG: +X local rotation DIPS the nose
  w.y += ( cmd.yaw   * FLIGHT.YAW_RATE   - w.y) * k; // +Y local rotation = nose LEFT (steer sign map)
  w.z += ( cmd.roll  * FLIGHT.ROLL_RATE  - w.z) * k; // +Z local rotation tips ship-up toward screen-right = roll RIGHT (E)
  eu.set(w.x * dt, w.y * dt, w.z * dt, 'XYZ');
  dq.setFromEuler(eu);
  q.multiply(dq).normalize();        // right-multiplied = LOCAL-frame integration (true 6DOF)
  return q;
}
export function forward(out)  { return out.set(0, 0, 1).applyQuaternion(q); }
export function shipUp(out)   { return out.set(0, 1, 0).applyQuaternion(q); }
export function shipRight(out){ return out.set(1, 0, 0).applyQuaternion(q); }
export function quat()        { return q; }
export function resetOrientation() { q.identity(); w.set(0, 0, 0); }
```

**Why the signs above are already correct (derived, then assert-pinned anyway):**
rotation about local +X maps +Z→(0,−sin,cos) = nose dips ⇒ pitch-up needs the NEGATIVE
sign; rotation about local +Z maps +Y→(−sin,cos,0) = ship-up tips toward local −X, and
local −X is screen-right at heading 0 ⇒ +roll = roll right = `E`. The red-first asserts in
story 7.1 prove each sign on the real build; a red means the derivation missed something,
not that the assert gets loosened.

### 3.2 `forward()` migration — the one true coupling

`forward()` keeps its exact signature and call sites (combat.js internals, weapons.js
bolts, aim-assist cones, probe spawns). **Roll does not change the nose direction**, so
bolt paths, lock acquire/retain cones, and pipper geometry are unchanged by 6DOF itself.
The ONE aim-side breakage is the SPREAD fan basis in `weapons.js`:

```js
// weapons.js — FAN basis: WORLD_UP degenerates when the nose is vertical and tilts the fan
// with world gravity. Ship-local up is orthogonal to forward BY CONSTRUCTION (never degenerates):
const FAN_UP = new THREE.Vector3();
// in spawnStreamShot(): FAN_UP.copy(shipUpLocal()); // handed over through the initWeapons seam
FAN.right.copy(d0).cross(FAN_UP).normalize();       // was: cross(WORLD_UP)
```

`aim-assist.js` needs NO logic change (its cones measure from nose-forward and stay valid
at any roll) — only its header comment gains the 7.1 provenance note.

### 3.3 Derived heading/pitch — the harness-compatibility keystone

`C.heading` and `C.pitch` STOP being player-owned state and become per-tick DERIVED reads:

```js
// combat.js, once per tick after orientTick:
const f = forward(C.tmp);
C.heading = Math.atan2(f.x, f.z);
C.pitch = Math.asin(clamp(f.y, -1, 1));
```

This keeps `combatState().heading/.pitch`, the SPD writer, the story-004 throttle/turn
asserts, and most of pitchProbe's rate asserts reading the SAME numbers they read today.
Only the clamp/loop semantics change (§5). `C.bank` stays as the cosmetic bank lean it
already is (it no longer feeds the pose; the roll IS the orientation now).

### 3.4 Camera — ship-space spring arm with damped roll

```js
// qTarget = world-up yaw/pitch frame (the OLD pose grammar, quaternion form) + 40% twist
export function camQuatTarget(out) {
  const f = forward(TMP_F);
  qYP.setFromEuler(EU.set(-Math.asin(clamp(f.y, -1, 1)), Math.atan2(f.x, f.z), 0, 'YXZ'));
  qT.copy(qYP).invert().multiply(q);                    // residual twist
  const s = qT.x * f.x + qT.y * f.y + qT.z * f.z;       // sin(φ/2) about the nose axis
  qR.setFromAxisAngle(f, 2 * Math.atan2(s, qT.w) * FLIGHT.CAM_ROLL_FOLLOW);
  return out.copy(qYP).multiply(qR);
}
// combat.js tick:
camQuatTarget(C.tmpQ);
C.camera.quaternion.slerp(C.tmpQ, 1 - Math.exp(-FLIGHT.CAM_ROT_K * dt));
C.camera.position.lerp(camTarget, 1 - Math.exp(-FLIGHT.CAM_POS_K * dt)); // camTarget keeps the
// existing form: pos + shipUp·3.4 − forward·(7.5 + |vel|·0.22) — shipUp replaces the +3.4 world hack
// FOV (change-gated): C.camera.fov = FOV_BASE + FOV_SPEED_GAIN * smooth; updateProjectionMatrix()
```

The old "up-vector safety envelope" comment dies with `PITCH_MAX`; the replacement guard
is the slerp itself (a slerp between two valid quaternions never degenerates) plus the F7
assert. The pipper's analytic screen-center anchor survives (the ship-space cam still
looks along the nose by construction).

## 4. Story ladder (execution order; one story per session)

| Story | Name | Size | New files | Tag after |
|---|---|---|---|---|
| 7.0 | Feel baseline + probe scaffold | S | `src/probes-flight.js` | `good-<date>-s7-0` |
| 7.1 | Flight body: 6DOF quaternion + camera v2 | M | `src/flight.js` | `good-<date>-s7-1` |
| 7.2 | Inertia, FA toggle (Z), strafe | M | — | `good-<date>-s7-2` |
| 7.3 | Open space + pulse drive | M | — | `good-<date>-s7-3` |
| 7.4 | Heat encounters (waves → response composer) | M | — | `good-<date>-s7-4` |
| 7.5 | Scan → discover → collect → upgrade | M–L | `src/scanner.js` | `good-<date>-s7-5` |

7.1+7.2 together ARE the NMS feel. 7.3+ make it a world instead of an arcade mode.
Stop anywhere — every boundary is shippable.

### 7.0 — Feel baseline + probe scaffold (do FIRST, small)
- Build `src/probes-flight.js`: the deterministic `?flightProbe=1` walk (droneProbe pattern:
  query flag → scripted drive → `window.__stage2.flightProbe` + `api.report` parity), with
  stages that today measure the OLD model (pitch clamp, ALIGN_RATE) so its asserts are
  seen RED on the pre-7.1 build by design (the honest-red pattern pitchProbe used).
- Record the baseline: build, flow-check count, boot-marks, 3 screenshots to `build/shots/`.
- No gameplay code. Allowed files: `src/probes-flight.js`, `src/probes.js` (re-export line),
  `src/combat.js` (one probe-tick call line).

### 7.1 — Flight body (the big one)
- Implement §3 verbatim. `steer()` splits: input mapping stays in combat.js (same deadzones,
  same 1.25× combined clamp, same pointer NDC reads), integration moves to flight.js.
  New keys: `Q`/`E` roll (input.js adds nothing — combat reads `keys.has('KeyQ'/'KeyE')`).
- `C.pose.quaternion.copy(q)` replaces the YXZ euler write; tilt group untouched.
- Camera per §3.4. `#warn`/rim stay (they die in 7.3, not here).
- ALLOWED: `src/flight.js` (NEW), `src/combat.js`, `src/weapons.js` (fan basis only),
  `src/input.js` (NO — roll is read via keys, zero-diff), `src/probes.js` (sanctioned
  pitchProbe rewrites), `tools/flow-check.mjs` (sanctioned), `tools/dep-check.mjs` (leaf rule),
  `tools/index.template.html` + `src/hud.js` (controls text: add Q/E roll line in BOTH places).
- FORBIDDEN: `enemies.js`, `boss.js`, `drone.js`, `powerups.js`, `audio.js`, `main.js`,
  `launch.js`, `phases.js`, `store.js`.
- Diff budget: ~240 lines net.
- RED-FIRST asserts (in flightProbe + flow-check): loop completes (F1); roll changes
  ship-up vs camera-up > 0.2 rad while nose-forward dot stays > 0.99 (F2); yaw rate 1.75±0.02
  (F3); ω 63% ≤ 0.12 s (F4); FA-on slip unchanged (F6 — keep-passing); camera slerp lag (F7);
  FOV rises with speed (F8 — pre-7.1 red: FOV is constant today); fan bolts stay ±6° from
  nose at pitch 60° AND roll 90° (the fan-basis mutation target).
- Mutations to record: (a) `q.multiply(dq)` → `q.premultiply(dq)` (world-frame integration)
  → loop/roll asserts RED; (b) fan basis back to WORLD_UP → fan assert RED at roll 90°;
  (c) CAM_ROLL_FOLLOW 0.4 → 0 → F7 RED.
- Sanctioned rewrites (dated in-file): pitchProbe's PITCH_MAX clamp assert → loop assert;
  `viewDirFromUp` bounds → replaced by the basis-guard assert; controls text.
- KEEP-PASSING (must stay green): story-004 throttle/turn block, scriptedKill, droneProbe,
  bossProbe (park + dash asserts — pose write change is invisible to them), charge/powerup/
  balance/fire probes, victory/gameover cards, restartProbe clean.

### 7.2 — Inertia, FA toggle (Z), strafe
- `C.vel` becomes the REAL state. FA-on (default): the story-015 lerp toward
  `forward·speed` stays for the nose channel; strafe (`A/D`+`R/F`-style ship-space lateral
  via dedicated keys — see card) adds `±STRAFE_A` u/s² on shipRight/shipUp with its own
  2.5/s damping. FA-off (`Z`): the lerp is SKIPPED — W/S become thrust/brake along the nose
  (ACCEL 14 / BRAKE 22, the existing consts), momentum is pure; |vel| still capped at the
  boost ceiling. `Z` state lives on C, resets to ON in enterCombat, persists NOTHING (a
  per-fight choice, like boost).
- The velocity-trail camera, `velMag`, SPD semantics: unchanged reads.
- ALLOWED: `src/flight.js`, `src/combat.js`, `src/hud.js` + template (controls text),
  `src/probes-flight.js`, `tools/flow-check.mjs` (new asserts only).
- RED-FIRST: FA-off + release → |Δvel| ≤ 2% over 1 s (F5); FA-on → converges < 8° in 0.8 s
  (F6); strafe changes lateral velocity with nose/heading unchanged; `Z` toggles and resets
  on re-entry.
- Mutation: FA-off branch deleted → F5 RED.

### 7.3 — Open space + pulse drive
- The R_SOFT/R_HARD clamp block becomes CONDITIONAL on `C.arenaActive` (true iff boss alive
  or a probe flag that parks at r3 78/60 is driving — bossProbe/dressingProbe keep passing
  untouched). Free flight: no clamp until the 3000 u outer shell (`R_OUT = 3000`, same bleed
  formula scaled, floor 3 u/s kept — the story-005 mud lesson). Rim ring + shell visuals
  become boss-room dressing (shown when arenaActive).
- Pulse drive: hold `Space` past the boost threshold (or a new key — card decides) ramps a
  second speed regime to 240 u/s with star-streak dressing + HUD chip; ANY damage cancels
  it same-frame (the damagePlayer site).
- ALLOWED: `src/combat.js`, `src/flight.js`, `src/arena-dressing.js` (visual gating only),
  `src/probes-flight.js`, `tools/flow-check.mjs` (sanctioned sphere-walk rewrite), template.
- RED-FIRST: position passes r3 90 with no clamp (F9); shell bleed at r3 > 2900; pulse
  crosses 100 u/s and decays on release (F10); damage cancels pulse within 1 tick.
- Sanctioned rewrite: the story-016 sphere-walk block (soft-shell bleed + hard clamp
  asserts) → outer-shell asserts. The bossProbe park/dash/pole asserts are NOT rewritten —
  they keep passing because the arena is active whenever the boss is.

### 7.4 — Heat encounters
- `C.heat` (+1 per registered kill via the existing weapons.js kill sites, decay 0.5/s when
  no encounter is live). Thresholds 3/6/9 → patrol/wing/warden, composed by calling the
  EXISTING `ENEMIES.startWave(w, pos)` + `DRONES.startWave(w)` with tier-derived w; the
  warden threshold spawns the boss (`BOSS.spawnBoss`) and sets `C.arenaActive = true` —
  the boss room materializes around the fight. `C.wave` becomes the threat tier (banner,
  telemetry, score fields keep their names and meaning).
- ALLOWED: `src/combat.js`, `src/weapons.js` (kill-site heat stamp only),
  `src/probes-flight.js` (heat stages), `tools/flow-check.mjs` (sanctioned wave-cycle
  rewrites), template (banner text).
- RED-FIRST: heat decays to 0; each threshold spawns exactly once per crossing (latch);
  cooldown at 0 spawns nothing (F11); warden crossing activates the arena.

### 7.5 — Scan → discover → collect → upgrade
- `src/scanner.js` (LEAF): `V` fires a 1 s-cooldown pulse; 35° cone / 120 u marks pickups
  (`POWERUPS.eachAlive`) + dressing anomalies (`DRESSING.nearestTo`); discovered names
  persist via the store.js guarded pair (readDiscovered/writeDiscovered, the readMuted
  pattern verbatim: canonical-JSON, corrupt reads as empty, honest warn on refused write).
  Kills award materials; a pick-one module card appears at threat-tier escalation (reuses
  the card grammar; three modules with measurable stat deltas).
- RED-FIRST: scan reveals N POIs; catalogue survives reload; a module produces a measurable
  stat delta (F12).

## 5. Harness migration map (the honest-cost table)

| Assert family | Today | Fate |
|---|---|---|
| story-004 throttle/turn (speed/heading) | reads C.speed/C.heading | SURVIVES (derived §3.3) |
| pitchProbe rate asserts (Δφ vs rate) | C.pitch state | SURVIVES (derived) |
| pitchProbe clamp/loop asserts | PITCH_MAX | REWRITTEN in 7.1 (sanctioned) |
| pitchProbe probe-owned `C.pitch = 0` resets | writes state | REWRITTEN: calls `resetOrientation()`-style probe seam |
| sphere-walk soft/hard clamp asserts | always-on | REWRITTEN in 7.3 (outer shell) |
| bossProbe park/dash/pole (r3 78/96) | always-on clamp | SURVIVES (arena active during boss) |
| dressingProbe shell parks (78/60) | always-on shell | SURVIVES (visuals gated, parks probe-flag-gated) |
| pipper/bracket/lock asserts | nose-frame | SURVIVES (roll ≠ nose direction) |
| fan/SPREAD asserts | WORLD_UP basis | EXTENDED in 7.1 (roll-90° case added) |
| restartProbe clean | C fields | EXTENDED (new fields in the reset list) |

Rule: every REWRITE carries dated in-file provenance + the exact-coverage argument + a
re-run mutation. Never a quiet edit.

## 6. Do NOT build (owner-ratified non-goals)

- Planetary terrain / seamless atmosphere (engine problem, not a feel problem).
- Physics-engine swap (rapier/cannon) — fights the deterministic probes, +400 KB.
- Multiplayer. Full-Newtonian-by-default (FA-on IS the NMS answer). VR/gamepad.
- Any new art/GLB/assets. Any balance-number change before telemetry says so.

## 7. Anti-drift session protocol (Stage 7)

1. Read `LAUNCH-10-10.md` §1/§8 (laws, lock, report format) — then THIS file.
2. Claim exactly one story from §4 in `one-shot-work/.active-session`.
3. Restate the story in two lines. Write the red-first asserts FIRST, show them RED on the
   previous tag's build with the reason.
4. Allowed/forbidden files are in the story card (`production/epics/flight-v2/story-7.x*.md`)
   — a file outside ALLOWED is DRIFT, stop.
5. Mutations recorded per assert; keep-passing list run; battery green; merge `--no-ff`;
   tag `good-<date>-s7-<n>`; update LEDGER + this file's ladder status; release lock; stop.
6. Two failed attempts on the same problem = stop and report (standing law).
7. Feel verdicts are owed to the owner after 7.1+7.2 and again after 7.4 — screenshots to
   `build/shots/`, never a claimed visual result.

## 8. Deferred tuning (backlog, NOT Stage 7)

MAX_SPEED 17→40 re-tune, bolt/HP rebalance against heat tiers, pulse-fuel economy, module
stat tables, engine audio for roll/pulse, elite-in-open-world spawns. Each needs telemetry
first (story-019's accumulator is the instrument).

---
*Ladder status: 7.0 DONE (2026-11-09, baseline recorded — see production/qa/evidence/story-7.0-feel-baseline/) · 7.1 TODO · 7.2 TODO · 7.3 TODO · 7.4 TODO · 7.5 TODO*
*(update this line at each story close)*
