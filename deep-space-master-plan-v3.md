# Deep Space: Protocol II — `/kee`-Hardened Master Plan (v4 · Flash Zero-Mistake Edition)

> [!IMPORTANT]
> **Why this v4 exists (`/kee` Gate A–F Audit):**
> Previous plans (`v1`, `v2`, `v3`, `million-dollar-look-plan.md`, and stale sections of `CLAUDE.md` / `LEDGER.md`) contained **unmeasured false premises** and listed **already-shipped features as future work**. If a lighter model (Gemini 3.8 Flash) executes those instructions blindly, it will break existing `tools/flow-check.mjs` assertions (currently **260/0 green**).
> Every instruction in this document has been verified against the live codebase at `HEAD` (`9a77125`, branch `story-7.5`) and `tools/flow-check.mjs`.

---

## 0. `/kee` Reality Check & The "DO NOT REBUILD" Freeze List

### 0.1 Debunked Myths (Gate A: Measure the Premise Before Naming the Cause)

| Myth in Earlier Plans | Measured Truth in Live Code | Proof |
| :--- | :--- | :--- |
| **"Headless boot takes ~60 seconds (`bootMs: 60596`) and lands on `gameover`"** | **False.** Real boot time (`window.__BOOT.title`) is **704 ms** headed (`RTX 3060`) and **1865 ms** headless. `src/main.js:231` defines `bootMs: () => Math.round(performance.now() - PERF_T0)`, which returns **total page uptime at inspection**, not boot duration! When `cdp-check.mjs` slept `65000 ms` on `?goto=combat`, the game entered combat at `2.06 s` and the idle ship was killed by Wave 1 bolts at `combat.time = 16.02 s` (`deathBy: "bolt"`). | Run `node tools/boot-marks.mjs headed` -> `TOTAL MODULE->TITLE: 704.2 ms`. |
| **"`window.__stage2.phaseHistory.includes('combat')` exists"** | **False.** `phaseHistory` does **not** exist anywhere in `src/`. The real counter is `window.__stage2.combatEntries` (incremented in `src/phases.js:64` and exposed at `src/main.js:228`). | `tools/cdp-check.mjs:72` already reads `s.combatEntries`. |
| **"We need to add `<div id='loading'>` to `index.template.html`"** | **False.** `<div id="loading" class="overlay" hidden><div class="title">LOADING</div><div class="sub" id="load-sub">INITIALIZING</div></div>` **already exists** in `tools/index.template.html:353-356` and is wired in `src/main.js:134-136`. | Read `tools/index.template.html:353-356`. |
| **"Only 3 files hardcode Edge `156.0.4314.58`"** | **False (Gate B).** **8** files in `tools/*.mjs` hardcode `156.0.4314.58`. | `boot-marks.mjs`, `boss-shot.mjs`, `cdp-check.mjs`, `combat-probe.mjs`, `death-card-check.mjs`, `drone-glb-probe.mjs`, `flow-check.mjs`, `victory-shot.mjs`. |

### 0.2 Already-Shipped Features — DO NOT TOUCH OR RE-IMPLEMENT (Defect Class 12)

`one-shot-work/LEDGER.md` stopped updating after Stage 4, but `CHANGELOG.md` and `tools/flow-check.mjs` prove the following are **already merged and guarded by assertions**. **Gemini 3.8 Flash MUST NOT redo or alter these:**

| Already-Shipped Feature | Live Files | Guarded by `tools/flow-check.mjs` Lines | Trap if Flash Touches It |
| :--- | :--- | :--- | :--- |
| **Stage 5 (`story-020` Settings Persistence + Riders A–D)** | `src/storage.js`, `src/audio.js` | `:2255–2389` | Changing storage keys (`dsp2.v1.*`) breaks 12 persistence asserts. |
| **Stage 6 `T1` (Title/UX Pro Pass)** | `tools/index.template.html:10` (inline SVG favicon), `:361` (`PROTOCOL II · FLIGHT READY`), `:103–107` (`.hints` 2-col grid), `:308–317` (`#pause` `.card` + buttons), `:378, 399` (`RECORD —` / `HIGH SCORE —`) | `:2475–2528` (`MutationObserver` on `#title-best` & `#go-best`) | Changing initial `#title-best` / `#go-best` text back to `0` breaks the pre-warm flash assert! |
| **Stage 6 `W1` (Weapon Systems Overhaul)** | `src/weapons.js` (`PULSE`, `SPREAD`, `BEAM`, `MISSILE`, keys `1–4` / `Q` / `Tab`) | `:2390–2430` | All 4 weapons & HUD slots `#wslot-0..3` are already live and tested. |
| **Stage 6 `H1` (HUD Rebuild)** | `tools/index.template.html:163-207` (`#hud-bars`, `#boss-bar`, `#wave-banner`, `#hit-mark`) | `:602–605`, `:703–707`, `:2460–2474` | `#boss-bar`, `#wave-banner`, and `#hit-mark` already exist. Do not duplicate IDs. |
| **Stage 6 `A1` (Audio Overhaul)** | `src/audio.js`, `src/sfx-pack.js`, `src/music-seq.js`, `src/assets/sfx/*.ogg` (9 Kenney CC0 files) | `:2435–2458` | **CRITICAL:** `flow-check.mjs:2439` asserts `apx.cap === 24 && apx.capPeak === 24`. **NEVER change `VOICE_CAP` from `24` to `16`!** |
| **TD-013, TD-014, TD-015** | `src/loop.js`, `src/combat.js:126`, `src/audio.js` | `:484` (`#tele` empty), `:2043–2100` (`?composerFault=1`, `?musicFault=1`) | Already fixed and pinned by fault-injection tests. |
| **Story 7.0 (`flightProbe`) & Story 7.4 (Camera-Axis Aim Overhaul)** | `src/probes-flight.js`, `src/aim-assist.js`, `src/weapons.js`, `src/combat.js` | `:1793–1948` | `#pipper` (`id="pipper"`) is already wired and tested. **Do NOT remove `#pipper`!** |

---

## 1. Non-Negotiable Rules for Gemini 3.8 Flash

1. **Never edit `index.html` directly.** Always edit `src/*.js` or `tools/index.template.html` and run `npm run build`.
2. **Never allocate inside per-frame loops (`new THREE.Vector3()`, `new THREE.Quaternion()`, `new THREE.Matrix4()`, `{}` literals, `.map()`, `.filter()`).** Pre-allocate module-scope scratch objects (`const TMP = new THREE.Vector3()`).
3. **Never add CSS `clip-path` to any element inside `#hud`.**
   - **Why (`tools/flow-check.mjs:658–667`):** The test harness counts drone threat pips by scanning all descendants of `#hud` whose computed `clipPath !== 'none'` and asserts `pipCount === 8`! Adding `clip-path` to `#reticle`, `#pipper`, or any HUD child will turn `pipCount === 8` RED (`pipCount === 9`).
4. **Preserve module-graph limits (`node tools/dep-check.mjs`):**
   - `src/main.js` must stay <= 500 lines (currently `271` lines).
   - No circular dependencies in `src/*.js`.
   - `window.__stage2` keys may only be added, never removed or renamed.
5. **Run the verification commands after EVERY story:**
   ```powershell
   npm run build
   node tools/dep-check.mjs
   node tools/flow-check.mjs
   ```
   All 3 must exit `0` (`FAIL: 0`) before committing.

---

## 2. Step-by-Step Execution Plan (Ordered Task Cards)

---

### TASK 0.1 — Fix `TD-016` & `TD-008`: Shared Edge Resolver & Profile Cleanup Across All 8 Tool Scripts

- **Goal:** Eliminate the hardcoded `156.0.4314.58` Edge path across all 8 `tools/*.mjs` scripts and clean up `build/.edge-profile-*` temp directories with Windows file-lock retry.
- **Files to Create / Edit:**
  1. **CREATE `tools/edge-bin.mjs`:**
     ```js
     import fs from 'node:fs';
     import path from 'node:path';

     export function resolveEdge() {
       if (process.env.EDGE && fs.existsSync(process.env.EDGE)) return process.env.EDGE;
       const roots = [
         'C:\\Program Files (x86)\\Microsoft\\EdgeCore',
         'C:\\Program Files\\Microsoft\\EdgeCore',
       ];
       for (const root of roots) {
         if (!fs.existsSync(root)) continue;
         const vers = fs.readdirSync(root)
           .filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d))
           .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
         for (const v of vers) {
           const cand = path.join(root, v, 'msedge.exe');
           if (fs.existsSync(cand)) return cand;
         }
       }
       const app = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
       if (fs.existsSync(app)) return app;
       throw new Error('msedge.exe not found; set EDGE env var');
     }

     export function rmProfile(dir) {
       try {
         fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
       } catch {}
     }
     ```
  2. **EDIT all 8 `tools/*.mjs` scripts** (`tools/flow-check.mjs:12`, `tools/boot-marks.mjs:13`, `tools/cdp-check.mjs:6`, `tools/boss-shot.mjs:9`, `tools/combat-probe.mjs:6`, `tools/death-card-check.mjs:10`, `tools/drone-glb-probe.mjs:19`, `tools/victory-shot.mjs:8`):
     - Replace `const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\156.0.4314.58\\msedge.exe';` with:
       ```js
       import { resolveEdge, rmProfile } from './edge-bin.mjs';
       const EDGE = resolveEdge();
       ```
     - Replace `try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}` in each `finally` block with `rmProfile(userData);`.
  3. **EDIT `tools/cdp-check.mjs:9`:**
     - Change default `waitMs` on line 9 from `25000` to `8000` (since headless boot is `1.86s`, `8000ms` catches `phase: "combat"` while the player ship is still alive before Wave 1 kills it at `16s`).
     - In `tools/cdp-check.mjs:69-77`, also include `bootTitleMs: window.__BOOT && window.__BOOT.title ? Math.round(window.__BOOT.title) : null` alongside `uptimeMs: s.bootMs ? s.bootMs() : null` so no one ever confuses `s.bootMs()` (uptime) with boot duration again.
- **Verification:**
  - Unset `$env:EDGE` (`Remove-Item Env:EDGE -ErrorAction SilentlyContinue`), delete `build/.edge-profile-*`, and run:
    ```powershell
    node tools/boot-marks.mjs headless
    node tools/cdp-check.mjs "file:///E:/Game%20Build/index.html?debug=1&goto=combat" 6000
    ```
  - Expect `phase: "combat"`, `combatEntries: 1`, `bootTitleMs < 3000`, and zero leftover `build/.edge-profile-*` directories.

---

### TASK 1.1 — Story 7.5: Asteroid Obstacles, Real Rock Collision & Clear Launch Corridor (Branch `story-7.5`)

- **Goal:** Thin the ambient asteroid field from `100` to `40` larger rocks (`0.8..3.5 u`), add real sphere-vs-sphere rock collision (`collideRocks`) so rocks block ships and bolts, and hide the launch-corridor dressing rings once combat starts.
- **Exact Traps to Avoid (`/kee` Gate A & C):**
  1. **DO NOT change the number of `rng()` calls per rock in `prepareDressing()`!** Keep the exact 7 `rng()` calls per rock (`theta, phi, rad, ex, ey, ez, s`). All 40 rocks generated by `mulberry32(17017)` with `rad = 25 + rng() * 50` are already >= 25 u > 18 u from the player start `(0, 18, 0)` and have >= 4.72 u clearance from the `+Z` probe corridor `(0, 18, z)`.
  2. **ACCOUNT FOR `D.group.rotation.y`!** In `src/arena-dressing.js:109`, `tickDressing` rotates `D.group.rotation.y += 0.005 * dt`. Therefore, rock local coordinates `(lx, ly, lz)` rotate around the Y axis over time! In `collideRocks`, compute each rock's world position from `D.group.rotation.y`:
     ```js
     const yaw = D.group ? D.group.rotation.y : 0;
     const cy = Math.cos(yaw), sy = Math.sin(yaw);
     // Three.js Object3D.rotation.y positive angle rotates +Z toward +X:
     const wx = r.lx * cy + r.lz * sy;
     const wy = r.ly;
     const wz = -r.lx * sy + r.lz * cy;
     ```
     *(Self-check in `rockProbe`: verify `(wx, wy, wz)` matches `new THREE.Vector3(r.lx, r.ly, r.lz).applyMatrix4(D.group.matrixWorld)` to within `1e-4` — `/kee` Two Routes, One Answer!)*
  3. **Update `freshTelemetry().damageTaken` parity in `tools/flow-check.mjs`!** Adding `rock: 0` to `damageTaken` in `src/combat.js:88` requires adding `&& tel19.damageTaken.rock === 0` to `tools/flow-check.mjs:1742`.

- **Step-by-Step Edits:**
  1. **`src/arena-dressing.js`:**
     - Line 25: Change `export const AMBIENT_FIELD_COUNT = 100;` -> `export const AMBIENT_FIELD_COUNT = 40;`.
     - Add `rocks: []` (`{ lx, ly, lz, radius }[]`) to `D`.
     - In `prepareDressing()` (lines 58–74):
       - Clear `D.rocks.length = 0;`.
       - Keep the loop `for (let i = 0; i < AMBIENT_FIELD_COUNT; i++)` with the exact 7 `rng()` draws:
         ```js
         const theta = rng() * Math.PI * 2;
         const phi = Math.acos(2 * rng() - 1);
         const rad = 25 + rng() * 50;
         const lx = O.x + Math.sin(phi) * Math.cos(theta) * rad;
         const ly = O.y + Math.cos(phi) * rad;
         const lz = O.z + Math.sin(phi) * Math.sin(theta) * rad;
         dummy.position.set(lx, ly, lz);
         dummy.rotation.set(rng() * 6.28, rng() * 6.28, rng() * 6.28);
         const s = 0.8 + rng() * 2.7; // 0.8 .. 3.5 u (7th rng draw preserved)
         dummy.scale.setScalar(s);
         dummy.updateMatrix();
         D.ambient.setMatrixAt(i, dummy.matrix);
         D.rocks.push({ lx, ly, lz, radius: s * 0.95 });
         ```
     - Export `collideRocks(pos, radius, outNormal)`:
       ```js
       export function collideRocks(pos, radius, outNormal) {
         const rocks = D.rocks;
         const yaw = D.group ? D.group.rotation.y : 0;
         const cy = Math.cos(yaw), sy = Math.sin(yaw);
         for (let i = 0, n = rocks.length; i < n; i++) {
           const r = rocks[i];
           const wx = r.lx * cy + r.lz * sy;
           const wy = r.ly;
           const wz = -r.lx * sy + r.lz * cy;
           const dx = pos.x - wx, dy = pos.y - wy, dz = pos.z - wz;
           const d2 = dx * dx + dy * dy + dz * dz;
           const minD = radius + r.radius;
           if (d2 < minD * minD) {
             const d = Math.sqrt(d2) || 1e-6;
             if (outNormal) outNormal.set(dx / d, dy / d, dz / d);
             return minD - d;
           }
         }
         return 0;
       }
       ```
     - Also export `getRockWorld(index, outVec)` (or expose `rocks` via `dressingLive()`) so `rockProbe` in `src/probes.js` can teleport a test point onto rock `0`'s exact world coordinates.
  2. **`src/launch.js`:**
     - Add and export:
       ```js
       export function setLaneVisible(v) {
         if (L.group) L.group.visible = !!v;
       }
       ```
     - In `startLaunch()` (around line 92), ensure `if (L.group) L.group.visible = true;`.
  3. **`src/combat.js`:**
     - Import `collideRocks` from `./arena-dressing.js` and `setLaneVisible` from `./launch.js`.
     - In `freshTelemetry()` (line 88): change `damageTaken: { bolt: 0, ram: 0, drone: 0, boundary: 0 }` -> `damageTaken: { bolt: 0, ram: 0, drone: 0, boundary: 0, rock: 0 }`.
     - Add `rockCooldown: 0` to `C` (and reset `C.rockCooldown = 0` in `enterCombat` and `clearCombat`).
     - In `enterCombat()`: call `setLaneVisible(false);`.
     - In `clearCombat()`: call `setLaneVisible(true);`.
     - Pre-allocate module-scope scratch vector `const ROCK_N = new THREE.Vector3();`.
     - In `tickCombat(dt)` after player position integration (`C.pos.addScaledVector(C.vel, dt)`):
       ```js
       if (C.rockCooldown > 0) C.rockCooldown = Math.max(0, C.rockCooldown - dt);
       const pen = collideRocks(C.pos, 1.4, ROCK_N);
       if (pen > 0) {
         C.pos.addScaledVector(ROCK_N, pen);
         const vn = C.vel.dot(ROCK_N);
         if (vn < 0) C.vel.addScaledVector(ROCK_N, -1.6 * vn);
         if (C.rockCooldown <= 0 && C.invuln <= 0 && !C.dead) {
           const impactSpeed = Math.max(0, -vn);
           const dmg = Math.min(25, Math.max(5, Math.round(impactSpeed * 0.6)));
           C.rockCooldown = 0.35;
           damagePlayer(dmg, 'rock');
         }
       }
       ```
     - In the player bolt loop in `tickCombat(dt)` (around line 356, inside `for (const b of W.bolts)`):
       ```js
       if (collideRocks(b.mesh.position, 0.3, null) > 0) {
         FX.burst(b.mesh.position, 0x88ccff, 0.45);
         W.despawnBolt(b);
         continue;
       }
       ```
  4. **`src/probes.js`:**
     - In `runDressingProbe` (or `runFlightProbe`), add `rockCollision` check:
       - Read rock `0` from `arena-dressing.js`, verify its formula world position matches `applyMatrix4(D.group.matrixWorld)` within `1e-4`, place the ship overlapping rock `0` with inward velocity, tick 1 frame, and record `rockHit: { deflected: ..., hpDelta: ..., rockTelDelta: ..., boltStopped: ... }`.
  5. **`tools/flow-check.mjs`:**
     - **Line 1167 (Sanctioned Assert Rewrite):** Change `dp17X.ambientCount >= 100` to `dp17X.ambientCount === 40` with a `SANCTIONED REWRITE (story-7.5)` comment block citing `docs/FIX_PLAN.md` Story 7.5.
     - **Line 1742:** Add `&& tel19.damageTaken.rock === 0` to the restart-parity check.
     - Add assertions for `rockHit.deflected === true`, `rockHit.hpDelta < 0`, `rockHit.rockTelDelta > 0`, `rockHit.boltStopped === true`, and `laneHiddenInCombat === true`.
- **Mutation Proof Required Before Commit:**
  - Comment out `collideRocks` call in `combat.js` -> rebuild -> run `flow-check.mjs` -> verify new rock collision assert fails RED -> restore -> verify `260+/0` GREEN.

---

### TASK 1.2 — Story 7.6: Soft Gravity-Well Return (Remove Wireframe Boundary Cage)

- **Goal:** Remove the visible wireframe boundary sphere (`D.shell`) from the scene and replace the hard `R > 78` wall clamp with a continuous soft gravity-well return acceleration beyond `R_SOFT = 60 u`.
- **Exact Traps to Avoid (`/kee` Gate A & C):**
  1. **KEEP `#warn` visibility threshold at `r3 >= 60`!**
     - `tools/flow-check.mjs:445` asserts `#warn visible at boundary (rv > 62, warnHidden === false)`.
     - `tools/flow-check.mjs:465` asserts `#warn hides after return inside (r3 < 58, warnHidden === true)`.
     - Both pass automatically if `#warn` un-hides whenever `r3 >= 60 && !C.dead`!
  2. **Keep `boundaryProbe` in `src/probes.js:266-315` working!**
     - Read `src/probes.js:265-320` and `tools/flow-check.mjs:435-475` before editing to confirm `boundaryProbe` reaches `r3 > 78` (for boundary damage) and returns inside `r3 < 58`.
- **Step-by-Step Edits:**
  1. **`src/arena-dressing.js`:**
     - Remove `D.shell` mesh creation (`IcosahedronGeometry(78, 2)` wireframe) from `prepareDressing()`.
     - Remove `D.shell` opacity update from `tickDressing()`.
     - In `dressingLive()`, remove `shellVisible` and `shellOpacity` (or return `shellRemoved: true`).
  2. **`src/combat.js:329-343`:**
     - Replace the hard position clamp at `r3 > C.arenaR` with soft pull (`R_SOFT = 60`, `R_WARN = 78`, `R_EMERGENCY = 130`), preserving boundary damage above `R_WARN = 78` and `#warn` visibility at `r3 >= 60`.
  3. **`src/probes.js:738-756` & `tools/flow-check.mjs:1137-1175`:**
     - Sanctioned Assert Rewrite at `flow-check.mjs:1137, 1158, 1170–1175`: replace the two `D.shell` wireframe visibility assertions (`opacityAt60 === 0` and `opacityAt78 > 0.2`) with `dp17X.shellRemoved === true` and soft-pull inward velocity verification.

---

### TASK 1.3 — Story 7.7: Viewport-Relative HUD (`--u`) & Diegetic Cockpit Bars

- **Goal:** Scale the HUD cleanly from `720p` to `4K` via a single CSS custom property `--u: clamp(0.75px, 0.095vmin, 1.8px)`, style `#reticle` and `#pipper` as crisp SVG/CSS vector rings, and move `SPD` + `HEAT` into `#hud-bars` next to `SHD`.
- **Exact Traps to Avoid (`/kee` Gate A & C):**
  1. **NEVER use `clip-path` on `#reticle`, `#pipper`, or any child of `#hud`!** (`flow-check.mjs:658–667` asserts `#hud` has exactly 8 elements with `clip-path !== 'none'`). Use `border`, `border-radius`, `box-shadow`, or inline `<svg>` instead.
  2. **NEVER delete or rename `#pipper` (`id="pipper"`)!** (`flow-check.mjs:1857, 1916–1945` asserts `#pipper` exists, is unhidden in combat, and gets `.locked`).
  3. **Preserve `#hud-bars` text assertions!** Keep `SHD`, `WAVE`, and `SCORE` labels intact in `updateHudBars()` (`src/combat.js:459-485`), and append `SPD` and `HEAT` meters inside `#hud-bars`.
  4. **Preserve `TD-014` (`#tele` empty on replay to pad):** `flow-check.mjs:484` asserts `document.getElementById('tele').textContent === ''` after `REPLAY -> pad`.

---

### TASK 2.1 — Stage C: Reproducible Asset Supply Chain (`tools/asset-build.mjs` + `MANIFEST.json`)

- **Rule:** *"Art direction may be manual; every mechanical transformation must be reproducible."*
- **Before importing any new external asset:**
  1. Create `tools/asset-build.mjs` and `src/assets/MANIFEST.json`.
  2. Every entry in `MANIFEST.json` must record:
     - `id`, `shippedPath`, `sourceUrl`, `author`, `license` (`CC0-1.0` or `CC-BY-4.0`), `licenseUrl`, `retrievedAt`, `sha256In`, `sha256Out`, `bytesIn`, `bytesOut`, `recipe`.
  3. Build-time license gate: fail `npm run build` if any file in `src/assets/` lacks a `MANIFEST.json` entry or has a non-permissive license.
  4. Auto-generate `CREDITS.md` from `MANIFEST.json`.

---

### TASK 2.2 — Stage D: Readability Spec, Prewarm & Vertical Slice Gate (Before Bulk Asset Import)

- **Goal:** Prove the visual target, shader prewarm, readability, and frame-time budget in **one representative 30–60s encounter** before converting the rest of the cast.
- **Step-by-Step Edits:**
  1. **Enforceable Readability & Lighting Constants (`src/constants.js`):**
     - Sky/nebula background luminance cap: <= 0.18 linear (strictly below `UnrealBloomPass.threshold = 0.82` so stars/nebula never bloom over incoming projectiles).
     - Friendly projectiles: cyan/blue (`#44ddff`..`#ffffff`), elongated bolt/beam silhouette.
     - Hostile bolts: high-contrast orange/red (`#ff3322`, core `#ffaa44`), spherical/diamond silhouette so shape + hue distinguish friend from foe under heavy bloom and colour-vision deficiencies.
     - Key/fill ratio: directional sun key intensity `2.6` vs. hemisphere fill `0.45` (~5.8:1) so unlit hull faces retain 3D form.
  2. **Shader & Pool Prewarm (`src/main.js` / `src/combat.js`):**
     - Call `renderer.compile(scene, camera)` at the end of `prepareCombat` / `prepareDressing` before hiding `#loading` so first-shot / first-explosion shader compilation stalls are `0 ms` during combat.
  3. **Accessibility & Motion Toggles (`src/storage.js`):**
     - Add independent persistent toggles (`dsp2.v1.shake`, `dsp2.v1.flash`, `dsp2.v1.hitstop`, `dsp2.v1.camMotion`) and honor `window.matchMedia('(prefers-reduced-motion: reduce)')` as default for motion (kept separate from flash).
  4. **Vertical Slice Stress Gate (`tools/slice-check.mjs`):**
     - Measure `bootTitleMs` (<= 2000 ms headless, <= 1000 ms headed), frame-time median (<= 16.7 ms), `p95` (<= 22 ms), and worst frame (<= 33.3 ms) during simultaneous boss barrage + explosion burst.

---

### TASK 3.1 — Stage E: 6DoF Quaternion Flight v2 (Stories 7.1, 7.2, 7.3, 7.8, 7.9)

> [!WARNING]
> **Story Numbering Note:** `one-shot-work/STAGE-7-FLIGHT-V2.md` numbered Heat and Scanner as `7.4` and `7.5`, which collided with `docs/FIX_PLAN.md` Stories `7.4–7.7`. Here they are numbered **7.1 (Quaternion Core)**, **7.2 (Boost & Brake)**, **7.3 (Inertial Drift)**, **7.8 (Heat Encounters)**, and **7.9 (Scanner & Discovery)**.

- **CRITICAL `/kee` Gate C Trap in Story 7.1 (`src/flight.js` + `src/combat.js` + `src/weapons.js`):**
  1. **Camera Aim Alignment (Protects Story 7.4 `probes-fire.js` Stage 6):**
     - In `STAGE-7-FLIGHT-V2.md` §3.4, `camQuatTarget` was written as looking parallel to `forward`. However, the camera sits at `C.pos - forward * (7.5 + speed * 0.22) + shipUp * 3.4` and in current `combat.js:350` calls `C.camera.lookAt(C.pos + forward * 4)` (a ~16.47 deg downward pitch from the camera toward the crosshair point 4 u ahead of the nose!).
     - Because Story 7.4 (`ac7145b`) computes aim-assist rays along the **camera forward axis**, if `7.1` makes `C.camera.quaternion` parallel to `forward` instead of looking at `C.pos + forward * 4`, the camera ray will point 3.4 u above the ship's nose and **`probes-fire.js` Stage 6 will fail RED!**
     - **Exact Fix for 7.1:** Compute `camLookMatrix.lookAt(C.camera.position, LOOK_PT, CAM_UP)` where `LOOK_PT = C.pos + forward * 4` and `CAM_UP = lerp(WORLD_UP, shipUp, FLIGHT.CAM_ROLL_FOLLOW).normalize()`, set `camQuatTarget.setFromRotationMatrix(camLookMatrix)`, `C.camera.quaternion.slerp(camQuatTarget, 1 - Math.exp(-FLIGHT.CAM_ROT_DAMP * dt))`, and **ALWAYS call `C.camera.updateMatrixWorld(true)` immediately afterward!**
  2. **SPREAD Fan Basis in `src/weapons.js:125`:**
     - Currently line 125 does `FAN.right.copy(FAN.center).cross(WORLD_UP).normalize()`. When pitching straight up (+/-90 deg in 6DoF), `FAN.center` is parallel to `WORLD_UP` and `.cross(WORLD_UP)` becomes `(0, 0, 0)`!
     - **Exact Fix for 7.1:** Pass `shipUp: (out) => flightUp(C.flight, out)` in `W.initWeapons(...)` and use `FAN.right.copy(FAN.center).cross(W.shipUp(FAN.up)).normalize()` in `spawnStreamShot()`.
  3. **Preserve `combatState()` Contract (`src/combat.js:495-535`):**
     - `combatState()` must continue returning numeric `yaw`, `pitch`, `roll`, `speed`, `velMag`, plus new fields `quat: [qx, qy, qz, qw]`, `forward: [fx, fy, fz]`, `up: [ux, uy, uz]`, `boostFuel`, `boosting`, `braking`, `drifting`, `heat`.
     - Derive scalar `yaw = Math.atan2(-forward.x, forward.z)` and `pitch = Math.asin(Math.max(-1, Math.min(1, forward.y)))` from `flightForward(C.flight, TMP)` so all existing `flow-check.mjs` yaw/pitch assertions stay 100% green!

---

## 3. Summary Checklist for Execution Order

1. **[ ] Task 0.1:** Create `tools/edge-bin.mjs`, wire all 8 `tools/*.mjs` scripts, fix `cdp-check.mjs` default wait (`8000ms`), verify `node tools/flow-check.mjs` (`260/0`).
2. **[ ] Task 1.1 (Story 7.5 on branch `story-7.5`):** `AMBIENT_FIELD_COUNT = 40`, `collideRocks` with `D.group.rotation.y` transform, `setLaneVisible(false)` in combat, `damageTaken.rock`, update `flow-check.mjs:1167, 1742` + rock collision probe + mutation proof.
3. **[ ] Task 1.2 (Story 7.6):** Remove `D.shell` wireframe, add soft pull for `r3 > 60`, keep `#warn` at `r3 >= 60`, sanctioned rewrite of `flow-check.mjs:1170–1175`.
4. **[ ] Task 1.3 (Story 7.7):** `--u` HUD scaling, `#reticle` + `#pipper` vector styling (NO `clip-path`!), `SPD` + `HEAT` bars in `#hud-bars`.
5. **[ ] Task 2.1 & 2.2 (Stages C & D):** `tools/asset-build.mjs` + `MANIFEST.json`, `renderer.compile(scene, camera)` prewarm, accessibility settings, vertical slice stress gate.
6. **[ ] Task 3.1 (Stage E — Flight v2):** `src/flight.js` (7.1 quaternion 6DoF with lookAt + `updateMatrixWorld(true)` and `weapons.js` `shipUp` basis -> 7.2 Boost/Brake -> 7.3 Drift -> 7.8 Heat -> 7.9 Scanner).
