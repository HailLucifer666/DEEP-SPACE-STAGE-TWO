# Deep Space: Master Engineering & Production Plan v4 (Definitive)

> **Document Status**: Canonical & Authorized — Merges `v2` (decisions, budgets, asset tables, risk register), `million-dollar-look-plan` (pipeline, CC0/CC-BY supply chain, lighting passes), and `v3` (vertical slice gate, silhouette & readability rules, runtime percentiles).  
> **Order Correction**: Cast scale-out, modular boss assembly, CC0 combat soundtrack, and 1.0 release gates are prioritized directly following the Vertical Slice Gate, placing Open World loops (1.1) post-launch.  
> **Repository Baseline**: Commit `34404b8` on `master`. Foundation Phase 0 / Milestone 1 (TD-016, 7.5, 7.6, 7.7) is **100% COMPLETE** and verified (`259 passed, 0 failed` in `tools/flow-check.mjs`).

---

## 1. Executive Summary & Production Methodology

### 1.1 The Quality Contract
This plan elevates Deep Space from a functional low-poly prototype into a release-grade space combat experience comparable to premium indie titles. We achieve this not through random asset accretion, but through:
1. **Vertical-Slice First Discipline**: We prove the visual stack (sky, materials, bloom, lighting, enemy silhouette, weapon FX, audio bus, and performance) on **one** representative combat encounter before scaling to the rest of the cast.
2. **Readability Over Uncontrolled Glare**: Bloom, particle intensity, and silhouettes are governed by strict mathematical contrast rules. Combat feedback remains crystal clear even under intense boss barrages.
3. **Rigorous Performance Headroom**: Zero shader hitching after loading, deterministic frame percentiles on reference desktop hardware, and dual budgeting (file size $\le 20\text{ MB}$ and peak memory).
4. **Single-File Standalone Architecture**: The immutable architecture invariant remains intact: everything packages into a self-contained, offline-playable `index.html` via `node tools/build.mjs`.

### 1.2 The Reference Target Machine & Resolution
Performance gates throughout this document are benchmarked on:
- **Reference Tier**: Desktop with NVIDIA GeForce RTX 3060 (or AMD Radeon RX 6600), 6-core modern CPU (Intel Core i5/i7 10th+ gen or AMD Ryzen 5 3600+), 16 GB RAM.
- **Reference Display**: 1080p ($1920\times 1080$) standard; 1440p ($2560\times 1440$) high-DPI scaling check.
- **Target Frame Time**: P50 $\le 11.1\text{ ms}$ (90 fps), P95 $\le 16.6\text{ ms}$ (60 fps), Worst-frame $\le 33.3\text{ ms}$ (30 fps floor during peak boss explosions).
- **Shader hitch target**: $\Delta\text{renderer.info.programs.length} = 0$ throughout all gameplay following the initial pre-warm phase.

---

## 2. Master Decision Matrix (D1 – D9)

| ID | Topic | Decision | Technical Rationale & Invariant |
|:---|:---|:---|:---|
| **D1** | Single-file vs Multi-file | **Strict Single-File (`index.html`)** | All models, textures, audio, and shaders are base64-encoded or procedural in `src/` and built via `tools/build.mjs`. |
| **D2** | Hero Ship Collision Model | **Fixed Multi-Sphere Approximation** | Never use GLTF mesh triangles for raycasting or collision. Hero ship uses 3 fixed spheres (cockpit $r=1.2$, port wing $r=0.8$, starboard wing $r=0.8$). |
| **D3** | Asset Supply Chain | **Curated CC0 / CC-BY with Hashes** | Every external mesh/audio file is cataloged in `tools/asset-manifest.json` with SHA-256, license URL, author, and triangle/sample count. |
| **D4** | Post-Processing & Bloom | **Controlled Threshold Selective Bloom** | UnrealBloomPass with high threshold ($0.85$), low radius ($0.4$), strength ($0.6$). Emissive materials reserved exclusively for weapons, engine cones, and threat indicators. |
| **D5** | Flight Control Axis Model | **Full 6DoF Quaternion Core with Flight Assist** | Internal ship orientation uses `THREE.Quaternion`. Mouse yaw/pitch, Q/E roll, W/S throttle. Flight Assist toggle (`Z` key) toggles between coupled arcade drift and Newtonian uncoupled coasting. |
| **D6** | Asteroid Field & Obstacles | **40 Large Obstacles with Deflection & Bolt Blocking** | Completed in 7.5. Dynamic rock deflection, ship impact damage (`damageTaken.rock`), and bolt occlusion. Ambient count reduced from 120 tiny rocks to 40 readable obstacles. |
| **D7** | Boundary & Danger Feedback | **Non-Strobe Soft-Bleed Shell** | Completed in 7.6. Removed blue wireframe sphere. At $r \ge 60\text{ u}$, `#warn` displays amber warning; at $r \ge 72\text{ u}$, red alert with velocity bleed; hard clamp at $R=80\text{ u}$. Respects reduced flash guidelines. |
| **D8** | Keybinding Resolution | **De-conflicted Control Layout** | `Space` = Engine Boost (`velMag` burst); `Shift` = Pulse Drive / Cruise warp; `Q`/`E` = Roll; `Z` = Flight Assist toggle; `C` = Tactical Scanner; `Mouse Left` = Primary fire; `Mouse Right` = Secondary / lock missile; `P` / `ESC` = Pause. |
| **D9** | Audio Architecture | **Layered Web Audio Bus with Limiter** | Master limiter (DynamicsCompressorNode) on master gain. 24-voice hard cap with priority stealing (player weapons > threat warnings > enemy hits > ambient hum). Music ducked $-6\text{ dB}$ on explosions. |

---

## 3. Visual & Art Specification (Enforceable Standards)

### 3.1 Color Palette & Contrast Hierarchy
To ensure instant combat readability across dark voids and bright nebula backdrops:
- **Hero & Friendly Projectiles**: Electric Cyan (`#00f0ff`) and Ice Blue (`#7dd7ff`). Diamond / bolt-slug geometry with forward particle streaks.
- **Hostile Standard Projectiles**: Vivid Crimson (`#ff2a44`) and Plasma Orange (`#ff5500`). Needle-shaped elongated beams with red trail particles.
- **Elite Hostiles**: Pure Amber / Gold (`#ffaa00`) with distinct dual-wing silhouette and pulsing engine core.
- **Boss Projectiles**: Deep Violet / Magenta (`#d000ff`) with distinct radial geometry; never confused with red or orange raider bolts.
- **Powerups / Pickups**: Emerald Green (`#00ff88`) for repair/shield drops; Solar Yellow (`#ffe600`) for weapon power modules.
- **Background Luminance Ceiling**: Max background pixel luminance $\le 0.18$ in sRGB ($L \le 45$ out of 255) across all skybox faces to guarantee high contrast ratio ($> 4.5:1$) against all HUD elements and projectiles.

### 3.2 Silhouette Invariance Rule
Every enemy class must be identifiable by its solid black untextured silhouette against a white background at $100\text{ u}$ distance:
1. **Scout / Raider**: Sharp delta-wing with sweep angle $> 50^\circ$.
2. **Gunner**: Twin-boom catamaran chassis with central weapon pod.
3. **Rammer / Heavy**: Truncated wedge / armored arrowhead, distinctly wider than long.
4. **Elite**: Forward-swept gull wing with dual vertical fins.
5. **Boss**: Multi-segmented capital dreadnought with distinct breakable structural pylons.

### 3.3 Hit-Stop & Camera Feedback Protocol
- **Hit-Stop Trigger**: Hit-stop (micro-pause of simulation clock) is **strictly limited** to:
  - Heavy missile impacts: $35\text{ ms}$.
  - Elite kill moments: $45\text{ ms}$.
  - Boss segment destruction: $60\text{ ms}$.
- **Retrigger Cooldown**: Minimum $150\text{ ms}$ interval between hit-stop triggers. Rapid-fire primary weapons **never** trigger hit-stop.
- **Accessibility & Test Suppression**: Automatically disabled when `prefers-reduced-motion: reduce` is active or when running under automated test harness (`window.__TEST_MODE = true`).
- **Screen Shake**: Decays quadratically over $200\text{ ms}$; maximum rotational displacement $\le 0.04\text{ rad}$.

---

## 4. Curated Asset Supply Chain & Budget Allocations

### 4.1 Asset Manifest Table
All assets are verified CC0 or CC-BY with explicit attribution.

| Asset Type | Item Name / Source | License | Original Size | Optimization Target | Budgeted Payload |
|:---|:---|:---|:---|:---|:---|
| **Hero Ship** | "Viper Space Interceptor" (Kenney Space Kit / Poly.pizza) | CC0 | 1.8 MB GLTF | Draco / quantized glb ($\le 12\text{k}$ tris) | $\le 450\text{ KB}$ |
| **Enemy Raider** | "Pirate Interceptor" (Kenney Space Craft) | CC0 | 1.2 MB GLTF | $\le 6\text{k}$ tris, 1 baked $1024\times 1024$ atlas | $\le 320\text{ KB}$ |
| **Enemy Heavy/Gunner** | "Heavy Frigate" (Poly.pizza / Kenney) | CC0 | 2.1 MB GLTF | $\le 8\text{k}$ tris, shared atlas | $\le 400\text{ KB}$ |
| **Boss Dreadnought** | "Modular Capital Carrier" (CC0 Kitbash) | CC0 | 4.5 MB GLTF | 3 modular sections, $\le 18\text{k}$ tris total | $\le 850\text{ KB}$ |
| **Cockpit / Interior** | Procedural Canvas PBR baked instrument console | CC0 / Code | 0 KB | Procedural high-res bump & emissive | $\le 80\text{ KB}$ |
| **Skybox / Nebula** | ESO Deep Field HDR / Space Backgrounds (CC-BY 4.0) | CC-BY | 12 MB EXR | $6\times 1024\times 1024$ Basis Universal WebP | $\le 1.6\text{ MB}$ |
| **FX Flipbooks** | 16-frame Explosion & Plasma Impact (CC0 OpenGameArt) | CC0 | 2.4 MB PNG | $4\times 4$ sprite sheet WebP ($512\times 512$) | $\le 220\text{ KB}$ |
| **Music: Combat** | "Deep Space Orbit" (Kevin MacLeod / Incompetech) | CC-BY 3.0 | 4.2 MB MP3 | 64 kbps mono Opus / OGG stream | $\le 1.1\text{ MB}$ |
| **Music: Boss** | "Wrath of the Void" (DST / OpenGameArt) | CC0 | 5.8 MB MP3 | 64 kbps mono Opus / OGG stream | $\le 1.4\text{ MB}$ |
| **SFX Battery** | 22 laser, shield, engine, and explosion samples | CC0 | 3.5 MB WAV | Quantized Web Audio ADPCM / WebM | $\le 650\text{ KB}$ |
| **Fonts & UI** | Orbitron & Rajdhani subset (Google Fonts) | SIL OFL | 180 KB TTF | WOFF2 base64 subset (Latin upper+num+punct) | $\le 48\text{ KB}$ |
| **Total Asset Ceiling**| | | | | **$\le 7.12\text{ MB}$ (raw) / $\le 9.5\text{ MB}$ (Base64)** |

### 4.2 Single-File Budget Cap
- **Raw Embedded Asset Limit**: $\le 9.8\text{ MB}$ base64.
- **Engine, Shaders & Game Code**: $\le 2.2\text{ MB}$.
- **Total `index.html` File Ceiling**: $\le 12.0\text{ MB}$ (Comfortably below the hard $20.0\text{ MB}$ architectural ceiling).
- **Runtime VRAM Budget**: $\le 180\text{ MB}$ GPU textures; $\le 45\text{ MB}$ decoded audio buffer.

---

## 5. Milestone Production Roadmap

```
+---------------------------------------------------------------------------------+
|  MILESTONE 1 (Phase 0): Foundation, Test Harness & Arena [COMPLETED & VERIFIED] |
|  - Edge bin resolution, rock physics & deflection, boundary alerts, HUD polish   |
|  - Status: 259/259 PASS on master (Commit 34404b8)                             |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|  STAGE C & D: Asset Pipeline, In-Engine Style Frame & Vertical Slice Gate       |
|  - tools/asset-manifest.json + build-time SHA-256 license check                 |
|  - In-engine Style Frame (?styleFrame=1) with beauty camera & lighting capture   |
|  - Vertical Slice: Hero Ship + 1 Elite Raider + Final Sky + Weapon FX + Audio   |
|  - Stress Probe: Max radial boss barrage bolt volume under bloom (60 FPS gate)   |
|  - Shader & Texture Pre-warming: renderer.compileAsync + initTexture            |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|  MILESTONE 2: Flight Dynamics v2 (6DoF & Spatial Movement)                      |
|  - Story 7.1a: Full Quaternion 6DoF core (pitch/yaw/roll with no gimbal lock)   |
|  - Story 7.1b: Flight Assist toggle (Coupled arcade vs Uncoupled Newtonian drift)|
|  - Story 7.7b: Reticle & Lock Bracket re-projection check under 6DoF camera     |
|  - Story 7.2:  Variable Thruster Curve, Boost Fuel Burn & Linear Brake          |
|  - Story V2:   Dynamic Engine Plume & Afterburner Particle Exhaust             |
|  - Story 7.3:  Inertial Velocity Vector & Cockpit Drift Indicator             |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|  MILESTONE 3: Combat Cast Scale-Out, Modular Boss & Full Audio Symphony (1.0)  |
|  - Scale out Gunner, Rammer & Scout models from the proven asset kit            |
|  - Assemble Modular Boss Dreadnought with destructible sub-targets              |
|  - Integrated Web Audio Bus: master limiter, 24-voice pool, ducking & CC0 music |
|  - Combat pacing: Wave escalation, threat telegraphing, elite encounters       |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|  RELEASE 1.0 GATE: Quality, Polish & Delivery                                   |
|  - Animated combat victory & death telemetry cards (shots, accuracy, damage)   |
|  - Comprehensive Settings Menu: Audio volume, Screen Shake, Reduced Motion/Flash|
|  - Automated Release Verification: zero shader hitches, 60 FPS P95, <20MB check |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|  MILESTONE 4 (Post-1.0): World Exploration & Resource Extraction (v1.1)         |
|  - Story 7.4: Long-Range Spatial Scanner (Pulse ping & point-of-interest HUD)   |
|  - Mining Laser Beam & Asteroid Ore Harvesting Loop                             |
|  - Heat Accumulation & Overheat Venting Mechanics                               |
|  - Deep Space Warp Navigation between sector waypoints                          |
+---------------------------------------------------------------------------------+
```

---

## 6. Detailed Task Specifications

### 6.1 Stage C: Asset Manifest & Validation Supply Chain
- **Task C.1: Build Asset Manifest Tooling (`tools/asset-manifest.mjs`)**:
  - Validates all external assets against `tools/asset-manifest.json`.
  - Checks SHA-256 hash, file size, license attribution text, and polygon count.
  - Generates automated attribution card embedded in `#credits` dialog.
- **Task C.2: Texture & Mesh Optimizer**:
  - GlTF-transform script to prune unused vertex attributes (COLOR_0, JOINTS, WEIGHTS).
  - WebP conversion with quality $80$ for color maps and lossless for normal/roughness.

### 6.2 Stage D: In-Engine Style Frame & Vertical Slice Gate
- **Task D.1: In-Engine Style Frame Scene (`?styleFrame=1`)**:
  - Static beauty scene containing: Hero ship, 1 Elite Raider, 1 textured asteroid, background nebula, key directional sunlight ($I=2.5$), subtle ambient fill ($I=0.35$), and selective UnrealBloomPass.
  - Verifies: Silhouette contrast against skybox, sRGB color grading, metallic-roughness response, and no blown-out whiteouts.
- **Task D.2: Shader & Texture Pre-Warming**:
  - In `src/renderer.js` / `src/combat.js`:
    ```javascript
    await renderer.compileAsync(scene, camera);
    renderer.initTexture(explosionSpriteSheet);
    renderer.initTexture(cockpitConsoleTexture);
    ```
  - Proves zero runtime program generation (`renderer.info.programs.length` constant).
- **Task D.3: Vertical Slice Encounter Harness**:
  - 45-second deterministic combat scenario: Hero vs 1 Elite Raider in full arena with sky, rock obstacles, primary lasers, missile locks, explosions, and 1 combat music track.
  - Stress Probe: Injects simultaneous 60-bolt radial barrage simulating boss attacks.
  - Gate Verification: `node tools/slice-check.mjs` asserting:
    1. Headless boot mark `window.__BOOT.title <= 2200 ms` (Headed $\le 850\text{ ms}$).
    2. Frametime P95 $\le 16.6\text{ ms}$, worst $\le 33.3\text{ ms}$.
    3. Program compilation count delta $= 0$.
    4. Active audio voices $\le 24$ with no audible clipping or distortion.

### 6.3 Milestone 2: Flight Dynamics v2
- **Story 7.1a (Quaternion Flight Core)**:
  - Migrate `player.rotation` Euler angles to `player.quaternion`.
  - Pitch, yaw, and roll operate locally via `quaternion.multiply(deltaQuat)`.
  - Eliminates all gimbal lock and camera flip anomalies at vertical attitudes.
- **Story 7.1b (Flight Assist System)**:
  - Add `flightAssistEnabled` state (Default: ON).
  - When ON: Automatic counter-thrust dampens angular drift and aligns velocity vector with forward nose when throttle is released.
  - When OFF (toggled via `Z`): Pure Newtonian drift; angular momentum persists, ship can face backward while coasting along forward momentum vector.
  - Cockpit HUD indicator `#flight-assist` displays `[ FA: COUPLED ]` vs `[ FA: DRIFT ]`.
- **Story 7.7b (Crosshair & Reticle Alignment Verification)**:
  - Update `src/aim-assist.js` to project target lead reticle and distance brackets directly through the 6DoF camera matrix.
  - Re-run test battery to confirm `flow-check.mjs` lock bracket invariants remain green.
- **Story 7.2 (Thrust Dynamics, Boost & Brake)**:
  - Boost consumes afterburner capacitor (recharges over $4.0\text{ s}$).
  - `Space` triggers forward impulse, scaling maximum velocity from $20\text{ u/s}$ to $45\text{ u/s}$.
  - `S` activates reverse braking thrusters with dynamic opposing particle bursts.
- **Story V2 (Volumetric Exhaust Plume)**:
  - Upgrade engine cone to animated multi-stage shader mesh: inner plasma white core, outer transparent cyan envelope, and velocity-stretched trail particles.
- **Story 7.3 (Drift & Velocity Vector Indicator)**:
  - Project normalized velocity vector onto HUD as a prograde flight marker `(○)` and retrograde marker `(X)` when drifting.

### 6.4 Milestone 3: Cast Scale-Out, Modular Boss & Audio System (1.0)
- **Task 3.1: Cast Scale-Out**:
  - Integrate Scout, Gunner, and Rammer models with unique AI combat behaviors:
    - *Scout*: Fast hit-and-run strafing runs at distance.
    - *Gunner*: Turreted broadside volleys from medium range.
    - *Rammer*: Heavily shielded charge attacks with short-range blast telegraphs.
- **Task 3.2: Modular Boss Dreadnought**:
  - Three targetable subsystems: Port Shield Generator, Starboard Shield Generator, and Central Core.
  - Destructible visual states: Subsystem explosion particles, flaming hull breaches, and phased attack transitions.
- **Task 3.3: Web Audio Master Architecture**:
  - Implement Audio Context graph:
    `[Voices] -> [Voice Gains] -> [Mix Sub-Buses (SFX / Music)] -> [DynamicsCompressorNode Limiter] -> [Master Gain] -> destination`.
  - Dynamic music cross-fading between exploration ambient, combat raider loop, and dramatic boss phase.

### 6.5 Release 1.0 Gate: Quality & Accessibility
- **Telemetry Victory Card**:
  - Upon boss defeat: High-resolution HUD overlay displaying Mission Time, Accuracy %, Damage Absorbed, Asteroid Collisions, and Final Score.
- **Settings & Accessibility Panel**:
  - Master, SFX, and Music volume sliders.
  - Screen Shake intensity toggle ($0\%, 50\%, 100\%$).
  - Flashes & Whiteouts toggle (replaces bright screen flashes with red border vignette).
  - Color-blind friendly marker presets (Deuteranopia / Protanopia / Tritanopia).
- **Automated Verification Gate**:
  - `node tools/dep-check.mjs` ($\le 500$ lines in `src/main.js`).
  - `node tools/build.mjs` ($\le 12.0\text{ MB}$ output).
  - `node tools/flow-check.mjs` ($100\%$ green across all 259+ tests).
  - `node tools/slice-check.mjs` (Performance and shader stability verification).

### 6.6 Milestone 4 (Post-1.0): World & Discovery (v1.1)
- **Story 7.4 (Spatial Scanner)**:
  - Long-range pulse radar (`C` key) revealing asteroid ore density, distant derelicts, and warp beacons.
- **Mining Mechanics**:
  - Continuous continuous-beam mining laser extracting titanium, platinum, and cobalt from rich asteroids.
- **Heat Management**:
  - Overheating weapon capacitor forcing tactical cooling periods or emergency coolant flush.

---

## 7. Risk Register & Mitigation Strategy

| Risk ID | Hazard Description | Severity | Probability | Mitigation Strategy |
|:---|:---|:---|:---|:---|
| **R1** | GLTF Base64 bloating `index.html` beyond $20\text{ MB}$ | High | Medium | Automated pre-build step runs Draco compression and aggressive gltfpack quantization. Hard build failure if size $> 12\text{ MB}$. |
| **R2** | Shader compilation hitch when first firing weapons or exploding | High | High | Mandatory pre-warm step via `renderer.compileAsync(scene, camera)` with all pooled particle and beam meshes pre-attached during the loading phase. |
| **R3** | Bloom wash obscuring enemy incoming fire during heavy combat | Critical | Medium | Selective Bloom mask applied only to weapons and emissive tags; strict projectile luminance floor and distinctive projectile geometry (needles vs diamonds). |
| **R4** | Audio clipping during multi-missile explosions | High | Medium | DynamicsCompressorNode master limiter on Web Audio destination; 24-voice hardware cap with priority drop algorithm. |
| **R5** | 6DoF camera rotation causing user disorientation or simulator sickness | Medium | High | Retain Horizon Stabilization option in Flight Assist; fixed cockpit frame references; accessible toggle for reduced motion. |

---

## 8. Immediate Next Step: Stage C & D Execution
1. Create `tools/asset-manifest.json` and `tools/asset-manifest.mjs` to establish the verified supply chain.
2. Build the in-engine Style Frame (`?styleFrame=1`) and establish the baseline shader pre-warming harness (`renderer.compileAsync`).
3. Construct the Vertical Slice Gate test (`tools/slice-check.mjs`) with the boss radial barrage stress probe to lock in the 60 FPS performance floor before scaling out Milestone 2 flight and Milestone 3 combat.

