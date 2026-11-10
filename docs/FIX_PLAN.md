# STAGE TWO - FIX PLAN (Stories 7.4 - 7.7)

Save this file as `E:\Game Build\docs\FIX_PLAN.md`.

## HOW THE OWNER USES THIS (not for the agent)

0. Zip a backup of `E:\Game Build` first.
1. Give ZCode ONE story at a time, with this exact message:

   > Read docs/FIX_PLAN.md. Read the RULES section and STORY 7.x only (replace x). Do only that story, in step order. When finished, send the REPORT using the template and STOP. Do not start another story.

2. Play the game for 5 minutes after each story. Only then start the next story.
3. Order: 7.4 (aim) -> 7.5 (asteroids + collision) -> 7.6 (boundary) -> 7.7 (HUD).
4. If ZCode gets stuck or a test fails, paste its REPORT back to Claude.

---

## RULES (agent: read these first, every time)

1. Do ONE story only. Stop when it is done.
2. Read the code region before you edit it. Edit only the files the story lists. No refactors, no renames, no formatting changes.
3. `index.html` is GENERATED. HTML/CSS edits go in `tools/index.template.html`, then run the build (see `package.json` scripts and `tools/build.mjs`).
4. After EVERY step: build and run the project's test battery (find the command in `package.json` / `docs/architecture.md`). If something you did not expect fails: undo that step, say so in the REPORT, and stop. Never delete or weaken a test. You may rewrite only the tests this plan names as "sanctioned", and you must list each one in the REPORT.
5. DO NOT TOUCH: boss lock exclusion, boss and orb hit logic (except where the story says so), the flight model, camera geometry (offsets, lookAt 4 u ahead, FOV 62), `scriptedKill`, the restart allocation baseline. Do not allocate new objects per frame: use module-level temp vectors.
6. Line numbers in this plan come from an earlier read. Search by function name if they moved.
7. If a name used below does not exist in the code, find the real equivalent by reading, and write what you mapped in the REPORT. Do not invent APIs. Do not guess.
8. Keep every existing export and the `?lock=0` override working.
9. `aim-assist.js` must NOT import from `weapons.js` (circular import). Pass values in as function parameters.

### REPORT TEMPLATE (send this at the end of every story)

```
STORY: 7.x
STEPS DONE: (list)
FILES CHANGED: (list)
NAME MAPPINGS I HAD TO MAKE: (list)
TESTS REWRITTEN (sanctioned): (list, with the old vs new assert)
BATTERY RESULT: (pass count / fail count; paste any failures)
DEVIATIONS FROM THE PLAN: (list, or "none")
```

---

## STORY 7.4 - AIM, AUTOLOCK, HIT DETECTION

**Why:** the camera sits 3.4 u above the ship and looks at a point 4 u ahead of it. Bolts fly along the ship's nose. The two lines only cross 4 u in front of the ship, so a target under the center circle is hit high by every bolt. The lock cones are also measured from the nose, so the lock grabs the wrong enemy.

**Files:** `src/weapons.js`, `src/aim-assist.js`, `src/combat.js`, `src/probes-fire.js`.

**Approach:** keep the camera as is. Make bolts aim at what the camera sees.

### Step 1 - Read only (no edits)
Read: `weapons.js` (`spawnBolt`, `spawnStreamShot`, `boltsTick`, constants), `aim-assist.js` (everything), `combat.js` around the camera write (~541-545), the lock/fire calls (~506-507), the AIM/weapons init lines (~234-245), and `enemies.js` ~line 155 (where elites set a radius). Write down in the REPORT: the name of the property that holds an enemy radius, the name of the lock-state variable in `aim-assist.js`, and the function the old code uses to test "is this target alive".

### Step 2 - Constants
In `weapons.js`: `BOLT_SPEED` 42 -> **70**. `BOLT_LIFE` 1.2 -> **1.1**.
In `aim-assist.js`, add this object (exported):

```js
export const AIMK = {
  CONVERGE_DIST: 28,  // u from the camera, used when nothing is locked
  ACQUIRE_DEG: 12,    // lock acquire cone, from the camera axis
  RETAIN_DEG: 20,     // lock keep cone
  LOCK_RANGE: 80,     // u from the camera
  LOCK_GRACE: 0.35,   // s to keep a lock after the target leaves the retain cone
  HOMING_RATE: 6      // bolt steering smoothing (higher = sharper)
};
```

### Step 3 - aim-assist.js: camera helpers
Add the camera as a live reference through the same init seam the other references use (`initAimAssist`; do the matching edit at the call site in `combat.js` ~240-245). Then add:

```js
let _cam = null;                       // set from init: _cam = camera
const _cp = new THREE.Vector3(), _cf = new THREE.Vector3();
const _t = new THREE.Vector3(), _p = new THREE.Vector3();
const COS_ACQ = Math.cos(THREE.MathUtils.degToRad(AIMK.ACQUIRE_DEG));
const COS_RET = Math.cos(THREE.MathUtils.degToRad(AIMK.RETAIN_DEG));
const velMap = new WeakMap();
let graceT = 0;

function camState() { _cam.getWorldPosition(_cp); _cam.getWorldDirection(_cf); }

// cosine between camera forward and the direction to point p; -1 if too close or too far
function camCos(p) {
  _t.copy(p).sub(_cp);
  const d = _t.length();
  if (d < 6 || d > AIMK.LOCK_RANGE) return -1;
  return _t.divideScalar(d).dot(_cf);
}

function trackVel(t, dt) {              // smoothed velocity from position change
  let s = velMap.get(t);
  if (!s) { s = { p: t.position.clone(), v: new THREE.Vector3() }; velMap.set(t, s); }
  if (dt > 1e-4) { _t.copy(t.position).sub(s.p).divideScalar(dt); s.v.lerp(_t, 0.35); }
  s.p.copy(t.position);
}

export function leadPoint(target, from, speed, out) {
  const s = velMap.get(target);
  out.copy(target.position);
  if (!s) return out;
  for (let i = 0; i < 2; i++) {
    const tt = Math.min(from.distanceTo(out) / speed, 1.0);
    out.copy(target.position).addScaledVector(s.v, tt);
  }
  return out;
}

// Direction for a new bolt. Stream bolts: toward the locked target's lead point.
// Charged bolts: never lock-aimed (manual), but still camera-true.
export function aimDir(muzzle, charged, speed, out) {
  camState();
  const lt = charged ? null : getLockTarget();     // use the module's existing lock variable
  if (lt) leadPoint(lt, muzzle, speed, _p);
  else _p.copy(_cp).addScaledVector(_cf, AIMK.CONVERGE_DIST);
  return out.copy(_p).sub(muzzle).normalize();
}
export function getLockTarget() { return /* existing lock variable, or null */; }
export function targetAlive(t) { /* reuse the old "is alive" test, return boolean */ }
```

Leave `biasDir` in the file (tests may import it) but it will no longer be called.

### Step 4 - aim-assist.js: rewrite `lockTick(dt)`
Keep its name, signature, and any telemetry it feeds (`combatState().lockTarget`). Keep the boss exclusion exactly as is (only raiders and orbs are candidates). New logic:

```js
export function lockTick(dt) {
  camState();
  if (lock && targetAlive(lock)) {          // 'lock' = existing lock variable
    trackVel(lock, dt);
    if (camCos(lock.position) > COS_RET) { graceT = 0; return; }
    graceT += dt;
    if (graceT < AIMK.LOCK_GRACE) return;   // keep the lock briefly
  }
  lock = null; graceT = 0;
  let best = COS_ACQ;
  // loop over the SAME candidates the old code looped over (raiders + orbs, alive only)
  //   skip candidates behind the ship (reuse the old nose-forward check)
  //   const c = camCos(cand.position); if (c > best) { best = c; lock = cand; }
  if (lock) trackVel(lock, dt);
}
```

No lock delay of any kind: lock is instant.

### Step 5 - weapons.js: bolt direction
In `spawnBolt(dmg, charged, dir)`:
- If `dir` is given (spread fan), use it. Otherwise call `AIM.aimDir(b.position, charged, BOLT_SPEED, b.userData.dir)` right after `noseWorld(b.position)`.
- DELETE the `AIM.biasDir(...)` call.
- Add: `b.userData.target = charged ? null : AIM.getLockTarget();`
- Keep `b.lookAt(...)` after the direction is set.

In `spawnStreamShot` (the 3-bolt SPREAD fan): compute the base direction with `AIM.aimDir(noseTmp, false, BOLT_SPEED, base)` (`noseTmp` from `noseWorld`), then apply the existing +-6 degree rotation about WORLD_UP to `base` (instead of to `forward()`), and pass each result as `dir`.

### Step 6 - weapons.js: homing and swept hit test in `boltsTick`
Add module-level temps: `_prev, _hp, _hd, _ab, _ac, _cl` (all `THREE.Vector3`). In the bolt update callback, in this order:

```js
_prev.copy(b.position);                                   // BEFORE moving

const tg = b.userData.target;                             // homing (stream bolts only)
if (tg && AIM.targetAlive(tg)) {
  AIM.leadPoint(tg, b.position, BOLT_SPEED, _hp);
  _hd.copy(_hp).sub(b.position).normalize();
  if (b.userData.dir.dot(_hd) < 0) b.userData.target = null;   // passed it: stop homing
  else {
    b.userData.dir.lerp(_hd, 1 - Math.exp(-AIM.AIMK.HOMING_RATE * dt)).normalize();
    b.lookAt(C.tmp.copy(b.position).add(b.userData.dir));
  }
}

b.position.addScaledVector(b.userData.dir, BOLT_SPEED * dt);   // existing move line
```

Add the helper:

```js
function segHitsSphere(a, b, c, r) {
  _ab.copy(b).sub(a);
  const t = THREE.MathUtils.clamp(_ac.copy(c).sub(a).dot(_ab) / (_ab.lengthSq() || 1), 0, 1);
  return _cl.copy(a).addScaledVector(_ab, t).distanceToSquared(c) < r * r;
}
```

Raider scan: replace `dx*dx+dy*dy+dz*dz < 1.1` with:

```js
const r = Math.max(d.RADIUS_PROP || 0, 1.1) * 1.6;   // RADIUS_PROP = the property you found in Step 1
if (segHitsSphere(_prev, b.position, d.position, r)) { ...existing hit code... }
```

Orb scan: keep its existing radius (`ORB_BOLT_R2`) but use the same swept test with `Math.sqrt(ORB_BOLT_R2)`. Boss scan: do NOT change.

### Step 7 - combat.js and the pipper
- Immediately after the camera `lookAt(...)` in `tickCombat`, add `camera.updateMatrixWorld(true);` so every projection after it (pipper, lock bracket) uses this frame's camera.
- In `aim-assist.js` `hudTick` (~189-204): remove the rule that hides the pipper when the cursor is within 72 px of center (`PIPPER_ON_PX`). The pipper is always visible while the combat HUD is on, and sits at screen center. Add: when `getLockTarget()` is non-null, add class `locked` to `#pipper`, otherwise remove it.

### Step 8 - Tests (sanctioned rewrites)
a) FIRST, before relying on the new code: add a new stage to `probes-fire.js`, following the existing stage pattern. It seats a raider ON the camera axis at 16, 24 and 34 u (`seat = camPos + camForward * D`), parks the cursor at center, fires real bolts, and records hit or miss. Run it against the OLD behavior if you can (git stash or a temp copy); it should fail. Note that in the REPORT.
b) `fireProbe` stage 1 currently asserts the bolt direction is within 1.1 degrees of the nose. Rewrite it: with nothing locked, the bolt direction equals `normalize(camPos + camForward*28 - muzzle)` within 0.5 degrees.
c) Stages 2-4 seat enemies 8.5 / 4 / 20 degrees off the NOSE. Re-seat them relative to the camera axis, keeping the same intent (inside the cone, outside the cone, at the retain edge): inside = 6 deg, outside = 25 deg, retain edge = 16 deg.
d) Stage 5 (boss is never locked) must pass UNCHANGED.
e) Run the full battery.

### DONE WHEN
- All tests pass (list the rewrites).
- The new camera-axis stage passes at 16, 24 and 34 u.
- `combatState().lockTarget` becomes non-null within 1 frame of an enemy entering 12 degrees of screen center.
- No new per-frame allocation (restart baseline test passes).

---

## STORY 7.5 - ASTEROIDS AND COLLISION

**Why:** about 200 rocks are drawn and none of them collide. The lane stream (2 bands x 40 rocks) keeps flowing through the arena during combat and causes most of the clutter.

**Files:** `src/combat.js`, `src/arena-dressing.js`, `src/launch.js`, `src/probes-*.js` (only the named asserts).

### Step 1 - Read only
Read: `arena-dressing.js` (seeding ~59-72, `nearestTo` ~125-136, show/hide ~104-105), `launch.js` (~25, ~140-162, how `combatFlow` moves the lane rocks), `combat.js` (~42, ~88, ~294-360 shell clamp and `damagePlayer`, ~502-560 `tickCombat`, ~248-319 how the ship position and velocity are integrated). In the REPORT, state exactly which variables move the ship each frame (position, drift velocity `C.vel`, throttle `C.speed` along the nose).

### Step 2 - Fewer ambient rocks
- `AMBIENT_FIELD_COUNT` 120 -> **40**.
- Cap the ambient rock radius at **3.5**.
- When seeding, reject any candidate closer than **18 u** to the player start position or any enemy spawn position.
- Keep the seeding deterministic (same seed -> same field).

### Step 3 - Lane rocks off in combat
- When combat begins, set `.visible = false` on the lane-rock instanced meshes (both bands). Keep the 3 far backdrop wrecks (`WRECK_N`) visible.
- When a new run starts (launch phase / restart), set them visible again. Do NOT dispose or remove them.
- Stop `combatFlow` from updating the lane rocks while hidden (or leave it, if it costs nothing and has no side effects).

### Step 4 - Ship vs rock collision
In `arena-dressing.js`, store every ambient rock as `{x,y,z,r}` in WORLD space at seed time (if the rock group never moves or rotates), or transform through `group.matrixWorld` if it does. `r` is the visual radius. Export:

```js
const SHIP_R = 1.1, RESTITUTION = 0.4, CRASH_COOLDOWN = 0.6;
let lastCrash = -10;
const _n = new THREE.Vector3();

export function collideRocks(shipPos, shipVel, now, onCrash) {
  for (let i = 0; i < rocks.length; i++) {
    const k = rocks[i];
    const dx = shipPos.x - k.x, dy = shipPos.y - k.y, dz = shipPos.z - k.z;
    const minD = SHIP_R + k.r * 0.85;
    const d2 = dx*dx + dy*dy + dz*dz;
    if (d2 >= minD * minD) continue;
    const d = Math.sqrt(d2) || 1e-4;
    _n.set(dx / d, dy / d, dz / d);
    shipPos.addScaledVector(_n, minD - d);               // push out
    const vn = shipVel.dot(_n);                          // shipVel = effective velocity (see below)
    if (vn < 0) {
      shipVel.addScaledVector(_n, -(1 + RESTITUTION) * vn);  // bounce
      shipVel.multiplyScalar(0.85);                          // lose speed
      if (now - lastCrash > CRASH_COOLDOWN) { lastCrash = now; onCrash(-vn, _n, k); }
    }
  }
}
```

**Effective velocity:** use the sum of everything that moves the ship per frame (drift velocity plus throttle along the nose). If the ship's motion is `C.vel + forward * C.speed`, then: build a temp vector from that sum, pass it as `shipVel`, and after the call write the change back into `C.vel` (`C.vel += (newTemp - oldTemp)`). Also on a crash set `C.speed *= 0.5`. Whatever the real variables are, the ship must end up pushed OUT of the rock and moving away, never stuck inside it.

In `combat.js`, call `collideRocks` in `tickCombat` AFTER the ship position integration and the shell clamp, BEFORE the camera write. The `onCrash` callback:

```js
function onRockCrash(speed) {
  damagePlayer(THREE.MathUtils.clamp(speed, 5, 25), 'rock'); // shield first; this already fires the red veil
  // EFFECTS.shake(0.6);   -> use the real shake call and signature
  // EFFECTS.explosion(shipPos); -> small, reuse the existing pooled effect, no new pool
  // play the existing player-hit / impact sfx
}
```

Add `'rock'` to the damage-source telemetry map (`combat.js` ~88 and ~357).

Bolts vs rocks: DO NOTHING (bolts pass through rocks, by design).

### Step 5 - Tests (sanctioned)
- `dressingProbe` asserts on `fieldCount` and shell fill (`arena-dressing.js` ~74, 91-99, 115-120): update the expected counts to 40 (ambient).
- Add one probe stage: place the ship overlapping a rock at speed -> assert (a) ship pushed out to at least `minD`, (b) shield or hull decreased, (c) a second contact inside 0.6 s causes no second damage.
- `flightProbe` shell stage boosts radially out through the field: it clears the field itself (`cpFieldClear`). Run it and confirm it does not die on the new collision. If it does, stop and report.

### DONE WHEN
- Battery passes (list rewrites). Restart allocation baseline unchanged.
- In play: flying into a rock bounces you, drains shield then hull, shakes the camera, and flashes red. No visible rock inside the arena can be flown through.
- The screen is no longer clogged: about 40 rocks, none bigger than 3.5 u radius near the player.

---

## STORY 7.6 - BOUNDARY

**Files:** `src/arena-dressing.js`, `src/combat.js`, `tools/index.template.html`, dressing probe asserts.

### Step 1 - Remove the blue shell
In `arena-dressing.js`: delete the shell mesh creation (~76-81, `SphereGeometry(80)`, additive `0x9fd8ff`), its opacity driver (~107-113), and the shell lines in `showDressing` / `hideDressing` (~104-105). Keep the equator rim ring and everything else (speed bleed, hard clamp, `rimOpacity`).

### Step 2 - Two-stage text warning
In `combat.js` ~294-326 where `#warn` is set, replace the single "EDGE OF SECTOR" with:
- distance from the arena center `r < 60` -> hide.
- `60 <= r < 72` -> text `APPROACHING ZONE EDGE`.
- `r >= 72` -> text `END OF COMBAT ZONE - TURN BACK`, and add class `danger` to `#warn` (remove it otherwise).
Keep the hard clamp at 80 u.

### Step 3 - Tests (sanctioned)
Remove only the shell-specific asserts in the dressing probe and the flow-check dressing block. Do not remove any other assert. Add one assert: `#warn` text is the TURN BACK text when the ship is placed at r = 75.

### DONE WHEN
Battery passes. No blue sphere or blur at the arena edge. Flying outward shows the two messages in order.

---

## STORY 7.7 - HUD

**Files:** `tools/index.template.html` (all HUD HTML/CSS), `src/combat.js`, `src/aim-assist.js`, `src/phases.js`. Then run the build.

First check `docs/` and the code for any rule limiting the number of HUD elements ("element budget"). If one exists and a step below adds an element, update that rule/test (sanctioned) and say so in the REPORT.

### Step 1 - Scale the whole HUD
On `#hud`, define: `--u: clamp(0.9px, 0.1vh, 1.8px);`
Convert every fixed pixel size in the combat HUD CSS to `calc(N * var(--u))` using the table below. (At 1080p, `--u` is about 1.08 px; at 1440p about 1.44 px; at 768p about 0.9 px.)

| Selector | Property | Old | New |
|---|---|---|---|
| `#tele` | font-size / top / right | 12px / 18px / 22px | 15u / 20u / 26u |
| `#hud-score` | font-size / top / left | 13px / 18px / 22px | 18u / 20u / 26u |
| `#hud-bars` | font-size / left / bottom / row-gap | 11px / 22px / 20px / 7px | 15u / 28u / 28u / 10u |
| `#hud-bars .meter` | grid columns | 86px 180px | 110u 260u |
| `#hud-bars .mtrack` | width / height | 180px / 8px | 260u / 14u |
| `#hud-chips` | font-size / top | 12px / 46px | 16u / 60u |
| `#wave-banner` | top | 72px | 90u |
| `#reticle` | width, height, arm size | 132px, 26px | 88u, 16u |
| `#hit-mark` | size | 22px | 28u |

(`N u` means `calc(N * var(--u))`.)

### Step 2 - Readability
- Add a dark panel behind the bars and the score block: `background: rgba(6,10,20,.45); padding: calc(10*var(--u)) calc(14*var(--u)); border-radius: calc(8*var(--u));`
- Add a dark outline to all HUD text: `text-shadow: 0 0 6px rgba(0,0,0,.9), 0 0 12px rgba(125,215,255,.35);`
- Show the number on each meter (HULL 100, SHIELD 26, BOOST 100) at the larger font size.

### Step 3 - Aim markers (one clear gun sight)
- `#pipper`: 28u circle, 2u border, plus a 4u center dot (`::after`). Always visible in combat (done in 7.4). Add `#pipper.locked { border-color:#ffd88f; box-shadow:0 0 10px rgba(255,216,143,.7); }`.
- `#reticle` (mouse square): arms 16u, border alpha .75 -> .45. It is only the steering cursor and must look secondary.
- Charge ring must not look like a lock ring: give it a different color (orange/amber, not blue) and show the text `CHARGING` just below the pipper while charge > 0 (use `#hud-chips` or one new element; see the element-budget check above).
- `#lock-bracket`: size it to the target. In `aim-assist.js` `hudTick`, compute `f = (innerHeight*0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov*0.5))`; `px = clamp(2 * hitRadius * 1.4 * f / dist, 34, 140)` (hitRadius = the same radius the bolt test uses; dist = distance from the camera). Set the element's width and height to `px` and position it with `translate(x - px/2, y - px/2)` (remove the fixed negative margin). Add a child element that shows the distance as a rounded number next to the bracket.

### Step 4 - Real speed
In combat, `#tele` must show the real speed: the length of `(drift velocity + forward * throttle)`, rounded to an integer, instead of throttle only (`phases.js` ~165-177, `combat.js` ~764-765). Keep the launch-phase text unchanged. If a test asserts the old SPD text in combat, rewrite it (sanctioned).

### Step 5 - Low hull
In the bars writer (`combat.js` ~567-573): when hull < 25, add class `crit` to the hull track. CSS:
```css
#hud-bars .mtrack.crit i { animation: critBlink .5s steps(2) infinite; }
@keyframes critBlink { 50% { opacity: .35; } }
#hitveil.crit:not(.on) { opacity: .25; animation: critPulse 1.2s ease-in-out infinite; }
@keyframes critPulse { 50% { opacity: .45; } }
```
Also toggle class `crit` on `#hitveil` the same way, and show `HULL CRITICAL` (via `#hud-chips` or the new element).

### Step 6 - Off-screen enemy arrows
`combat.js` ~663-687: change the ring radius from 130 px to `Math.min(innerWidth, innerHeight) * 0.38`, and the arrow size from 14px to 20u.

### Step 7 - Warning text size
`#warn`: font-size 13px -> 22u, move from `bottom: 64px` to `top: 22vh`, add `animation: warnPulse 1s ease-in-out infinite; @keyframes warnPulse { 50% { opacity: .55; } }`, and `#warn.danger { color: #ff6a4d; text-shadow: 0 0 14px rgba(255,106,77,.6); }`.

### Step 8 - Messages
- When the last enemy of a wave dies, show `WAVE CLEAR` in the existing `#wave-banner` for about 1.5 s, then the usual `WAVE n` banner for the next wave (`combat.js` ~595-604).
- In the `#hud-score` block, add a second line `HOSTILES n`, n = count of alive raiders and orbs.

### Step 9 - Tests (sanctioned)
Rewrite only HUD tests that assert old pixel sizes, old SPD text, or the old pipper-visibility rule. Run the build, then the full battery.

### DONE WHEN
- Text is readable at 1366x768, 1920x1080, and 2560x1440 (check all three by resizing the window).
- Center circle always visible, turns amber on lock; lock box fits the target and shows distance.
- SPD shows non-zero while the ship coasts.
- Low hull flashes and shows the warning.
- Battery passes.

---

## FINAL PLAYTEST CHECKLIST (owner)

1. Enemy dead center at short, medium and long range: 3 shots kills it.
2. Enemy crossing the screen: it dies without leading it by hand.
3. Lock box appears instantly and sits on the enemy.
4. Fly into an asteroid: bounce, damage, shake, red flash.
5. Fly to the edge: text warning only, no blue sphere.
6. HUD readable on your screen; low hull is obvious.
7. Play five waves without a crash or a stuck frame.
