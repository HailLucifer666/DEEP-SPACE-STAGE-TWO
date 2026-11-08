# STAGE 6 — POLISH PLAN (chair synthesis)

Provenance: owner brief 2026-11-08 ("HUD not there / launch screen not professional / audio is garbage / aim is bad + auto-lock / flag other non-pro gaps") → 3 exploration scouts (HUD+title, audio, aim+harness) → owner-approved plan → 3-member audit council (game-designer, qa-lead, code-reviewer) whose 8 CRITICAL findings are folded in. Domain audits: `scope.md`, `visual-audit.md`, `ux-audit.md`, `audio-audit.md` (all line-verified on disk 2026-11-08).

Standing laws (bind every story): **HONESTY** — every new HUD element renders state, never decoration; no element shows a value the harness cannot read from `combatState()`. **ELEMENT-BUDGET** — one meaning per element: reticle = steer/charge, pipper = bolt path, bracket = lock target, edge pips = off-screen threats.

Data-only changes: NONE. This stage touches no tuning knob in `assets/data` terms; bolt speed/damage/drop rates/wave tables are out of scope. Every P0–P2 item is a code story or a docs change.

## Priorities and story cards (execution order T1 → W1 → H1 → A1a → A1b)

Order rationale: T1 is independent and warms the harness-edit patterns; W1's fire-path baseline assert must exist before any bolt-affecting change; H1's lock brackets consume W1's lock state; A1 touches `weapons.js` call sites so it follows W1.

### T1 — Title/UX pro pass (P1, code, ui-programmer)
Files: `tools/index.template.html`, `src/main.js`, `src/input.js`, `src/hud.js`.
1. Inline SVG favicon (template head only).
2. Reword/remove dev chip "BUILD S4 · VI3W POWERED" (template :241).
3. Controls hint → two-column block. (The T-lock line is added by W1 once the key exists — a hint for a nonexistent control would violate the honesty law.)
4. Pause card: RESUME + SOUND buttons (`#pause` template :201), real-click asserts owned here (rider-D label-sync pattern); **cursor restored while paused** (drop `.playing` for the pause overlay, restore on resume — precondition, else buttons are invisible: `src/input.js:21-31`, `src/phases.js:121-123`).
5. Death + victory cards (:202-218) styling pass reusing `.pill` grammar — presentation only, no new mechanics.
6. RECORD-0 flash suppressed until store warm (`src/store.js:24-25`).
Acceptance: favicon link present; pause buttons clickable with visible cursor; RECORD never paints `0` when a nonzero record exists (observer assert; requires one-time `Page.addScriptToEvaluateOnNewDocument` harness capability). Evidence: `production/qa/evidence/stage6-t1/`.

### W1 — Aim overhaul (P0, code, gameplay-programmer)
Files: new `src/aim-assist.js`, `src/weapons.js`, `src/combat.js`, `src/input.js`, `src/store.js`, `src/hud.js` (controls text), `tools/index.template.html`, `tools/dep-check.mjs`.
1. **Fire-path baseline FIRST:** new assert — real-input drive on a `?scriptedKill`-style fixture page asserting on-nose bolts hit a seeded target — written and seen GREEN on the current build before any bias exists; establishes the invariant the bias must not break (harness probes bypass `spawnBolt`, so without this a defective bias ships green).
2. **Gun pipper:** cyan marker at the nose-forward projection; analytic anchor acceptable (nose ≈ screen center by construction); renders ONLY while diverging from the reticle past a threshold; self-hides when aligned; no clip-path polygons.
3. **Auto-lock:** own scan in `aim-assist.js` (do NOT change `scanNearest`'s return type — `proximityTick` requires a number, `src/combat.js:534` → `src/audio.js:351-353`); candidates = raiders/gunners/drones via `ENEMIES.eachAlive`/`DRONES.eachAlive`; **boss excluded** (weak-point automation, `src/boss.js:284-288` — documented in the module header); behind-camera never locks (pip dot-math `:591-599`); hysteresis acquire ≤6° / hold ~10°, retarget on death or cone exit; bias applied in `spawnBolt` to **stream bolts only**, sum clamped with the ±6° SPREAD fan, own scratch vector (`C.tmp` clobber, `src/weapons.js:103`); T toggles in combat; pref persisted via the reserved store surface (`src/store.js:42-55` mirror) with a raw-read seam for corrupt-seed tests; `?lock=0` probe override so existing probe pages stay unbiased; T line added to BOTH controls-text places (hint bar :256 new column layout from T1 + CONTROLS panel `src/hud.js:31-43`).
4. Import direction (dep-check-pinned): `combat.js` imports `aim-assist.js`; `aim-assist.js` imports `enemies.js`/`drone.js` directly; combat state via an `initWeapons`-style seam (`src/weapons.js:36-43`), NOT `probeEnv`; new dep-check rule: aim-assist must not import combat.js.
Acceptance: lock/pipper asserts read `b.userData.dir` directly; mutations recorded: bias-clamp removal → fire-path/bias assert RED; cone widened to 180° → outside-cone assert RED. Evidence: `production/qa/evidence/stage6-w1/`.

### H1 — HUD rebuild (P1, code, ui-programmer)
Files: `tools/index.template.html`, `src/combat.js`. `src/boss.js` untouched.
1. Dedicated boss HP **bar element** in template `#hud` (one `ui` map line), rounded-fraction change-gate (charge-meter pattern `combat.js:568-575`), fed from `BOSS.state()` `{hp,maxHp}`; boss text line leaves `#hud-bars`.
2. **SANCTIONED ASSERT REWRITES** (stage-5 precedent `one-shot-work/stage-5/GATE.md:18-22`): `tools/flow-check.mjs:539-540`, `src/probes.js:155`, harness sampling `:473-475` — dated provenance, exact-coverage reasoning, re-run mutations; "never render BOSS 0% while dying" contract preserved (`src/boss.js:389`).
3. Styled labeled HULL/SHIELD/BOOST meters (honesty law: same underlying values); wave banner as a restyled `#combat-online` grammar instance (template :224, CSS :126-130), input-events-none; hit markers kill-only ~150 ms; lock brackets cyan on the locked target only (consumes W1 state).
4. All writes change-gated (`combat.js:536-547` pattern); `clearCombat` reset list extended for every new element incl. boss-bar force via `lastBars=null`; drained assert extended; **no clip-path polygons** (protects `flow-check.mjs:658-667` pip count). Combat meters stay combat-only; ascent keeps `#tele`.
Acceptance: boss bar exists only while boss alive, fill tracks `combatState().boss.hp/maxHp`, gone after death, never during dying, honest (no NaN); banner shows/hides on its window; new elements drained on re-entry. Evidence: `production/qa/evidence/stage6-h1/`.

### A1a — Audio samples + mixing (P0, code, gameplay-programmer)
Files: `src/assets/sfx/*` (Kenney CC0, license verified — `CREDITS.md:14-21`), `src/assets.js`, `src/audio.js`, call sites, `tools/build.mjs`, `CREDITS.md` (record the music-loop drop).
Per `audio-audit.md` spec: loader `.ogg:'dataurl'`; `audio.sample()` ±5% pitch jitter + synth fallback; LAZY decode (cached AudioBuffer); sfx payload ≤ 800 KB raw (~5.5-5.7 MB build, under 6 MB ceiling); buses sfx/music between voices and master (mute stays on master.gain); StereoPanner + distance attenuation (pan = clamp(xRel/30, ±0.8), attenuation 1.0 ≤5 u → 0.2 floor at 45 u); voice cap 24 + per-event rate limits (explosion 50 ms, hit 40 ms, enemy fire 50 ms shared, UI 30 ms); compressor −18 dB / 4:1 / 0.25 s; one-shot synth cues: boss-spawn stinger, victory jingle (cue not music — orchestrator call recorded vs story-014 freeze), UI clicks, gunner fire; fallback CONSOLE-SILENT with probe-visible status; `crossfadeTo` catch contract verbatim.
Acceptance: `?audioProbe=1` — all samples decoded (byte-length threshold), panner in probe voice chain, far-gain < near-gain, muted ⇒ no new voices, voice-cap peak ≤ cap; `?sfxFault=1` — fallback fires per cue, zero console noise, phase lands. Evidence: `production/qa/evidence/stage6-a1/`.

### A1b — Music motion (P2, code, gameplay-programmer)
Per `audio-audit.md`: pads KEPT; sparse pluck-arp layer (short-decay filtered plucks, A-minor pentatonic over A2 110 Hz, few notes/bar, under pad level, subtle per-loop variation); hats-only percussion (no kick/snare v1); lookahead scheduling ~0.2 s ahead on ~100 ms timer; voices ride the bag contract (`runningLoops`, `musicEvict` sparing), routed through bag out-gain; never scheduled before unlock or while muted; TD-015 fault injection moved into the sequencer build path (stays non-vacuous).
Acceptance: sequencer counter advances monotonically (probe); stall detected; muted ⇒ no scheduling. Evidence: `production/qa/evidence/stage6-a1/`.

### P3 — Flag-only (NOT built; suggested fixes for the owner's next call)
Volume slider (mute-only was the stage-5 scope decision); radar/minimap; enemy health bars for non-boss enemies; UI hover sounds; TD-008 ~1 GB `build/.edge-profile-*` litter; CRLF phantom on `index.html` (line-ending noise, no content diff); stale `README.md:113-114` harness-surface list (`?scriptedKill=1` documented but never driven).

## Verification gate (applies to every story)

`npm run build` → `tools/dep-check.mjs` → `EDGE="C:/Program Files (x86)/Microsoft/EdgeCore/157.0.4341.42/msedge.exe" node tools/flow-check.mjs` → `boot-marks.mjs` headed (record-and-compare vs 1155 ms — boot-marks is not a numeric gate, the comparison is) → `combat-probe.mjs` (NaN-scan list extended to new elements). Red-first with recorded mutations; `CONSOLE []` on every page; assert-count deltas explained.
