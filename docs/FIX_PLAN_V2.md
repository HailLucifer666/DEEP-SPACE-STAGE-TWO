# STAGE TWO - COMBAT-FEEL FIX PLAN v2 (replaces the previous 7.C1-7.C3 plan and FIX_PLAN.md)

Save as `E:\Game Build\docs\FIX_PLAN_V2.md`.

This keeps ZCode's root cause and architecture (cursor-ray aim, camera-anchored lock, field cleanup, shell removal). It fixes the bugs found in review and adds the missing HUD story. Items marked **[CHANGE n]** differ from ZCode's plan.

## OWNER: HOW TO USE

0. Make a backup zip of `E:\Game Build`, and a git tag `pre-fixes`.
1. Send ZCode ONE story per message:

   > Read docs/FIX_PLAN_V2.md. Read RULES and STORY 7.C_ (replace the blank) only. Do only that story, in step order. Send the REPORT and STOP.

2. Order: 7.C1 -> 7.C2 -> 7.C3 -> 7.C4 -> SHIP. Playtest 5 minutes after each story before starting the next.
3. If a story fails or a test goes red that you did not expect, paste ZCode's REPORT to Claude.

---

## RULES (agent)

1. One story at a time. Stop at the end.
2. Read a code region before editing it. Edit only files the story names. No refactors, renames or reformatting.
3. `index.html` is generated. HTML/CSS edits go in `tools/index.template.html`, then `npm run build`.
4. After every step: build and run the battery. If an unexpected test fails: undo that step, say so, and stop. Never delete or weaken a test. Rewrite only tests named "sanctioned", record each old -> new in the REPORT.
5. DO NOT TOUCH: `src/probes-flight.js` (byte-stable), `enemies.js`, `drone.js`, `boss.js`, `powerups.js`, the flight model, camera geometry, boss lock exclusion, boss weak-point manual rule.
6. No per-frame allocation. Use module-level scratch objects.
7. If a name in this plan does not exist, find the real equivalent and say what you mapped. Never invent APIs.
8. Keep `?lock=0` killing the entire assist layer (lock, bias, lead, homing).
9. **[CHANGE 17] Process trim:** skip writing EPIC docs, story cards, the lead-programmer review and the TD gate until after SHIP. Keep: git tag before each story (`pre-7c1` etc.), red-first for aim only, the full battery, and a headed run with screenshots. Mutation tests: only the three named in 7.C1 and 7.C2.

### REPORT TEMPLATE

```
STORY: 7.C_
STEPS DONE:
FILES CHANGED:
NAME MAPPINGS:
TESTS REWRITTEN (sanctioned, old -> new):
BATTERY: pass/fail counts, paste failures
HEADED RUN: what I saw (screenshots saved where)
DEVIATIONS: (or none)
```

---

## STORY 7.C1 - THE GUN IS HONEST (aim, lock, homing, hit forgiveness)

Branch `story/7c1-aim`. Tag `pre-7c1` first.

**Facts to keep in mind (verified by arithmetic):** the camera looks down about 16 degrees at a point 4 u ahead of the ship. A target under the cursor at 16-34 u is therefore 11-15 degrees BELOW the nose line. After the fix, bolts will leave the nose angled DOWN about 11-15 degrees toward the cursor point. That is correct and expected, not a bug. The old pre-fix miss was Dy = +3.55 / +4.73 / +5.91 / +8.87 u at 16 / 20 / 24 / 34 u.

### Step 1 - Constants
- `BOLT_SPEED` 42 -> **60** **[CHANGE 4]** (at 42 u/s a target crossing at 8 u/s needs 10.8 degrees of lead, more than the bias cap; at 60 it needs 7.6).
- `BOLT_LIFE` unchanged.
- In `aim-assist.js`: `ACQUIRE_DEG` **9**, `RETAIN_DEG` **14** **[CHANGE 6]** (6/10 degrees is too narrow for "easy"), `LOCK_RANGE` **90** u from the camera, `BIAS_MAX` **12** degrees **[CHANGE 3]** (measured from the converged base direction), `AIM_FIXED_DEPTH` **30** u from the camera, `HOMING_TURN_RATE` 150 degrees/s, `HOME_MAX_ANGLE` 70 degrees.

### Step 2 - `AIM.aimDir(out, muzzle, allowLockAssist)` **[CHANGE 2, 3]**
```js
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _rp = new THREE.Vector3();
export function aimDir(out, muzzle, allowLockAssist) {
  _ndc.set(mouseActive ? input.mouse.x : 0, mouseActive ? input.mouse.y : 0); // the SAME values the reticle uses
  _ray.setFromCamera(_ndc, camera);
  const lt = (allowLockAssist && !lockOff) ? lockTarget : null;
  const depth = lt ? Math.max(6, lt.position.distanceTo(camera.position)) : AIM_FIXED_DEPTH;
  _ray.ray.at(depth, _rp);
  out.copy(_rp).sub(muzzle).normalize();                 // converged base direction
  if (lt) {                                              // stream bolts only: bias toward the lead point
    leadPoint(lt, muzzle, BOLT_SPEED, _lp);              // pos + smoothed vel * (dist / speed), 2 iterations, t <= 1 s
    _bd.copy(_lp).sub(muzzle).normalize();
    const ang = out.angleTo(_bd), cap = BIAS_MAX * Math.PI / 180;
    if (ang > 1e-4) out.lerp(_bd, Math.min(1, cap / ang)).normalize();
  }
  return out;
}
```
- Replace ZCode's `clamp(C.nearest, 9, 28) + |camera - ship|` depth rule with the fixed depth above. Reason: the muzzle is only about 0.9 u from the camera ray, so a fixed 30 u convergence is within about 0.4 u of the ray over 16-34 u, and it removes the ship-to-camera conversion bug class.
- **[CHANGE 3] Remove the 20 degree total-deflection guard.** The convergence alone is 11-15 degrees off the nose, so a 20 degree guard clips the lock bias. If a guard is wanted at all, use 45 degrees from the nose.
- Lock velocity: smoothed, not two raw samples. `v = lerp(v, (pos - prevPos) / dt, 0.35)` each frame while locked, only when `dt > 1e-4`. Clear in `resetAimHud`.
- **[CHANGE 8]** Directly after the camera `lookAt(...)` in `tickCombat`, add `camera.updateMatrixWorld(true)`. The pipper, the lock bracket and the ray all use that frame's camera. Note: fire runs before the camera write in the tick, so `aimDir` sees the previous frame's camera; this is fine (one frame) but do not reorder `tickCombat`.
- **[CHANGE 9]** Add an assert: with the pointer at a known px, the reticle element's center px and the projection of `ray.at(30)` agree within 1 px. If the canvas is not the full window, compute NDC from the canvas rect.

### Step 3 - `lockTick`
- Acquire/retain cones are measured from the cursor ray (same `_ray`), not the nose. Candidates: raiders and orbs, alive only, within `LOCK_RANGE`. Skip candidates behind the ship. Boss exclusion (`:139-152`) untouched.
- Instant lock, sticky (retain cone), and keep a lock for 0.35 s after the target leaves the retain cone before releasing.

### Step 4 - `weapons.js`
- `spawnBolt`: direction from `AIM.aimDir(dir, muzzle, !charged)`. Charged bolts: reticle-true, never lock-assisted, never homing.
- SPREAD: base direction from `aimDir`, then the existing +-6 degree rotation; only the center bolt gets homing.
- **[CHANGE 5, 10] Homing is NOT tied to the player's live lock.** A stream bolt homes to its spawn-time target for its whole life, as long as the target is alive, the angle to it stays under `HOME_MAX_ANGLE`, and it has not jumped. Pooled-bolt safety: every spawn MUST reset `home=false, homeTarget=null`; every kill clears `homeTarget`.
```js
// spawn: u.home = false; u.homeTarget = null;
// if (!charged && lockTarget && !lockOff) { u.home = true; u.homeTarget = lockTarget; u.hx = lockTarget.position.x; u.hy = ...y; u.hz = ...z; }

// boltsTick, before the move:
if (u.home) {
  const t = u.homeTarget;
  const jump = t ? Math.hypot(t.position.x - u.hx, t.position.y - u.hy, t.position.z - u.hz) : 99;
  if (!t || !AIM.targetAlive(t) || jump > 6) { u.home = false; u.homeTarget = null; }   // jump > 6 u in one frame = recycled by the pool
  else {
    u.hx = t.position.x; u.hy = t.position.y; u.hz = t.position.z;
    AIM.leadPoint(t, b.position, BOLT_SPEED, _hp);
    _hd.copy(_hp).sub(b.position).normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(u.dir.dot(_hd), -1, 1));
    if (ang > HOME_MAX_ANGLE_RAD) { u.home = false; u.homeTarget = null; }
    else if (ang > 1e-4) {
      u.dir.lerp(_hd, Math.min(1, HOMING_TURN_RATE_RAD * dt / ang)).normalize();
      b.lookAt(C.tmp.copy(b.position).add(u.dir));
    }
  }
}
```
(`enemies.js` is off limits, so use the position-jump test instead of an enemy id.)

### Step 5 - Hit forgiveness **[CHANGE 7]** (missing from ZCode's plan)
- Raider bolt hit radius: `max(<elite radius property>, 1.1) * 1.5` (about 1.65 u) instead of the hardcoded `r^2 = 1.1`. This also finally uses the elite radius no scan consumed.
- Use a swept test (segment vs sphere, previous position to new position) for raiders and orbs. Boss unchanged.
```js
function segHitsSphere(a, b, c, r) {
  _ab.copy(b).sub(a);
  const t = THREE.MathUtils.clamp(_ac.copy(c).sub(a).dot(_ab) / (_ab.lengthSq() || 1), 0, 1);
  return _cl.copy(a).addScaledVector(_ab, t).distanceToSquared(c) < r * r;
}   // capture _prev.copy(b.position) BEFORE the move
```

### Step 6 - Trigger **[CHANGE 12]**
Holding the button must keep firing. Remove the stream suppression at 0.6 s (`weapons.js:166-169`, `SUPPRESS_STREAM`): the stream continues while the charge fills in parallel; on release, a charged bolt fires if charge is full (reticle-true). Hint text becomes "LMB - FIRE (hold to charge a bonus shot)". Sanctioned: the charge walk's suppression asserts become "stream shots continue while charging". Cut from ZCode's plan: `chargeClack`, `chargeWhine` retune, amber-at-full audio work. Keep the small CHARGED label.

### Step 7 - UI for aim (ui-programmer part)
- The pipper folds into `#reticle` as the center marker, so there is ONE aim element (the marker follows the cursor, where bolts go). Delete `PIPPER_ON_PX`; the marker is never hidden by pointer position. Edit `tools/index.template.html` (not `index.html`).
- Lock bracket: materialize/dissolve states as ZCode specified, and the bracket must be centered on the locked target (check the screenshot).

### Step 8 - `src/probes-aim.js` (new, `?aimProbe=1`)
- **[CHANGE 11]** Compute seats from the LIVE camera: after N settle frames, `seat = cameraPos + rayDir * depthAlongRay` for 16 / 20 / 24 / 34 u. Do not hard-code CAM_BACK / CAM_UP / LOOK_AHEAD, so the probe survives later camera changes (this removes the "7.1 re-baseline debt"). Still record the analytic Dy values above as the expected pre-fix reds.
- Stage 1: red first on the OLD build (save the transcript as `flow-red-aim.txt`), then green: a stream bolt fired at each seat hits.
- Stage 2: `lockTarget` becomes non-null within 0.5 s at the 20 u seat and stays for 3 s.
- Stage 3: 8 u/s crossing target: at least 8 of 10 bolts hit.
- Homing witness: mutation `HOMING_TURN_RATE -> 0` must turn exactly this witness red. Also mutation: remove `aimDir` and confirm stage 1 goes red.
- Pool-safety assert: after a bolt kills its target and the pooled bolt is respawned as a charged bolt, `home === false` and `homeTarget === null`.
- `&lock=0` kills the entire layer (no lock, no bias, no homing); boss exclusion keeps passing.
- `flow-check` re-derivation (sanctioned): fireProbe s1-s5 re-expressed cursor-ray-relative as ZCode planned; old pipper-visibility assert intentionally flipped and recorded.

### DONE WHEN
Battery green; ladder green at 4 seats; 8/10 crossing; headed run: a dead-center raider at 20 u dies within 1 s of held fire, and the lock box sits on the enemy.

---

## STORY 7.C2 - FIELD AND COLLISION

Branch `story/7c2-field` (after 7.C1 is merged and the battery is re-run). Tag `pre-7c2`.

- Density: `AMBIENT_FIELD_COUNT` 120 -> 60, shell inner radius 25 -> 40 u. If any ambient rock has a radius above 3.5, cap it at 3.5 **[CHANGE 13]**. Lane stream hidden at `enterCombat` (`setLaneVisible(false)` on `streamA`/`streamB` only; far wrecks stay), restored on exit/restart.
- **[CHANGE 13] Drop the "corridor re-roll"** (re-rolling rocks within 10 u of the O->O+80z line). It changes the shipped field to suit a test, leaving a permanent clear tunnel straight ahead. The probe gate is enough.
- Probe gate: collision is disabled when `probesActive()` is true, **except** when the flag is `collisionProbe`. Add an assert that `probesActive()` is false in a normal (no-flag) run, so the shipped build always has collision.
- Collision (after `steer(dt)`): player radius about 0.9 vs ambient rocks (`nearestRock(pos)`, scale cached once in `prepareDressing`).
```js
// every frame, if overlapping the nearest rock (push-out along n):
pos += n * (minD - d);
if (vn < 0) v -= n * vn;                       // [CHANGE 14] always cancel the inward velocity (slide, no sticking/jitter)
if (rockCd <= 0 && vn < -0.5) {                // damaging contact
  v += n * (0.55 * (-vn) + 6);                 // bounce + knockback
  damagePlayer(clamp(6 + 1.2 * (-vn), 8, 30), 'rock');   // [CHANGE 14] speed-scaled
  rockCd = 0.9; EFFECTS.shake(0.12); /* reuse explosion, no new pools */
}
```
`v` must be the effective velocity (everything that moves the ship per frame: drift velocity plus throttle along the nose); write the change back into whichever variables move the ship, and say in the REPORT which they are. The ship must never end up stuck inside a rock. Bolts and enemies pass through rocks (v1).
- `probes-collision.js` (new): asserts push-out, damage tag `'rock'` and scaled damage, cooldown (second hit within 0.9 s deals no damage, but the push-out still happens), slide (no velocity into the rock after contact), phase-through negatives for bolts/enemies, lane stream hidden in combat and restored on exit, restart parity, `damageTaken.rock` telemetry. Mutation: remove the push-out and the probe must go red.
- Dressing re-bands as ZCode listed (at least 45 instances, shell 40-75 u, clearance keep-passing).

### DONE WHEN
Battery green; headed run: ramming a rock bounces, drains shield then hull, shakes the camera, flashes red; no visible rock in the arena can be flown through; no huge rocks filling the screen.

---

## STORY 7.C3 - BOUNDARY

Branch `story/7c3-boundary`. Tag `pre-7c3`.
- Delete the shell: mesh creation (`arena-dressing.js:76-81`), opacity driver (`:107-113`), show/hide lines (`:104-105`). Keep the rim/equator rings. Shell asserts become absence asserts.
- `#warn` text -> `END OF COMBAT ZONE - TURN BACK` at the existing r > 60 gate. Write `textContent` only when it changes. Physics (soft bleed, hard clamp 80) untouched.
- Asserts: warn text at r = 70; no shell mesh in the scene.

### DONE WHEN
Battery green; no blue wash at the edge; flying outward shows the text.

---

## STORY 7.C4 - HUD (missing from ZCode's plan)

Branch `story/7c4-hud`. Tag `pre-7c4`. Files: `tools/index.template.html` (then build), `combat.js`, `aim-assist.js`.

**[CHANGE 16]** The owner's HUD complaint was not covered by 7.C1-7.C3. Facts from the code: every HUD size is fixed px (11-13 px fonts, 180 px meters), so it is tiny at 1440p; SPD shows throttle, not real speed; low hull has audio only; the off-screen arrows sit in a 130 px ring near the aim area; there is no wave-clear text.

First check for an "element budget" rule in `docs/` or the tests. If a step adds an element and the rule blocks it, update the rule (sanctioned) and say so.

1. **Scale.** On `#hud` define `--u: clamp(0.9px, 0.1vh, 1.8px)`. Convert fixed px to `calc(N * var(--u))`:

| Selector | Property | Old -> New (N in units of --u) |
|---|---|---|
| `#tele` | font / top / right | 12 / 18 / 22 px -> 15 / 20 / 26 |
| `#hud-score` | font / top / left | 13 / 18 / 22 px -> 18 / 20 / 26 |
| `#hud-bars` | font / left / bottom / row-gap | 11 / 22 / 20 / 7 px -> 15 / 28 / 28 / 10 |
| `#hud-bars .meter` | grid columns | 86px 180px -> 110 260 |
| `#hud-bars .mtrack` | width / height | 180 / 8 px -> 260 / 14 |
| `#hud-chips` | font / top | 12 / 46 px -> 16 / 60 |
| `#wave-banner` | top | 72 px -> 90 |
| `#reticle` | box / arm | 132 / 26 px -> 88 / 16 |
| `#hit-mark` | size | 22 px -> 28 |

2. **Readability.** Dark translucent panel behind the bars and the score block (`rgba(6,10,20,.45)`, rounded), dark text outline on all HUD text, the numeric value on each meter.
3. **Aim markers.** The center marker inside `#reticle` is the one gun sight: about 28 u circle plus a center dot; amber when locked. The square brackets are thin and dim (alpha .45). Lock bracket sized to the target: `px = clamp(2 * hitRadius * 1.4 * f / dist, 34, 140)` where `f = (innerHeight / 2) / tan(fov / 2)`, positioned with `translate(x - px/2, y - px/2)`, with the distance shown beside it. The charge ring uses amber (not the blue lock color) plus the CHARGED label.
4. **Real speed.** In combat show the length of (drift velocity + forward x throttle), rounded. `probes-flight.js` is byte-stable: if it asserts the SPD text in combat, do NOT change SPD; add a second readout `VEL` instead and say so in the REPORT.
5. **Low hull.** Hull < 25: the hull bar blinks (`crit` class, steps animation), `#hitveil.crit:not(.on)` pulses slowly, and the text `HULL CRITICAL` shows.
6. **Off-screen arrows.** Ring radius from 130 px to `min(innerWidth, innerHeight) * 0.38`; arrow size 14 px -> 20 u.
7. **`#warn`.** Font 13 px -> 22 u, move to `top: 22vh`, slow pulse (opacity only), red `#ff6a4d` with a dark backing so bloom cannot wash it out.
8. **Messages.** `WAVE CLEAR` in `#wave-banner` for about 1.5 s when the last enemy of a wave dies, then the usual `WAVE n`. A `HOSTILES n` line in the score block (alive raiders + orbs).
9. Sanctioned test rewrites only for asserts of old px sizes, old SPD text or old visibility rules.

### DONE WHEN
Text readable at 1366x768, 1920x1080 and 2560x1440 (resize and check each); low hull is obvious; battery green.

---

## SHIP CHECKLIST (after 7.C4)

1. `npm run build`; confirm the single `index.html` works by double-clicking it (file://, no server), in Chrome and Edge, with zero console errors.
2. Play 5 waves and the boss without a crash or a stuck frame at all three resolutions.
3. Tag `good-<date>-final`. Push only when the owner says so.
4. Publish the built `index.html` (GitHub Pages, Netlify drop, or itch.io HTML), open the live link on a second device, then submit the link and the repo.
5. Do NOT start story 7.1 (flight-v2) before shipping.

## FINAL OWNER PLAYTEST

1. A dead-center enemy at short, medium and long range dies in about 1 s of held fire.
2. A crossing enemy dies without hand-leading.
3. The lock box appears instantly and is centered on the enemy.
4. Holding fire keeps firing; holding longer also gives a bonus charged shot on release.
5. Ramming a rock bounces, hurts, shakes, and flashes red; the field is no longer cluttered.
6. The edge shows text only.
7. The HUD is readable and the low-hull warning is obvious.
