# Stage 6 — Experience scope note (supersession record)

Date: 2026-11-08. Provenance: owner brief (HUD / title / audio / aim) → approved polish plan → audit council. This note records the stage-6 scope decisions that supersede earlier GDD lines, per the precedent that "stages are sequential scope decisions" (`stage-4-balance.md:37-39`).

## 1. Reticle / aim convergence — supersedes `full-3d-flight.md:391-393`

That stage-3 line said: "No aim-convergence system is added; the reticle stays a steering reference, not an aim point (unchanged story-004 model)." Stage 6 adds aim instrumentation and an optional assist, and the *steering semantics survive intact*:

- Bolts still fire along the ship's nose (`weapons.js:89` keystone table, `full-3d-flight.md:63-64`). Nothing re-aims bolts at the pointer ray — the drift-era ship fantasy is preserved.
- The reticle keeps its steering meaning (pointer offset = turn-rate command). The new **pipper** is honest instrumentation: it shows where the nose — and therefore the bolts — actually point, renders only while it diverges from the reticle, and self-hides when they agree. It does not become an aim point; it makes the existing nose-vs-pointer relationship legible.
- The new **auto-lock** is an optional, toggleable (T, default ON, persisted) soft magnetism: ≤6° spawn bias toward the locked target for stream bolts only, hysteresis acquire ≤6° / hold ~10°, no homing (bolts stay ballistic), lead stays manual, behind-camera never locks.
- **The boss is excluded from lock by design.** The weak-point zone is centered on the boss's own position (`boss.js:284-288`) and subtends ~2° at hold range; a 6° center-biased cone would land inside the ×3 node zone on nearly every shot and automate the one skill the boss fight exists to test ("aim skill reads at a glance", `boss.js:14-18`). Raiders, gunners and drones are lockable; the boss remains the steering exam. A future "boss lockable" request must re-open this analysis, not silently flip a flag.
- **The charged shot stays manual-aim reward** (stage-4 §4.1: "the aimed shot is the skill, the burst is its payoff"). Assist applies to stream bolts only in v1; revisit only with telemetry (`stage-4-balance.md` §3.7 shots/hits accumulator gains a lock-state boolean).
- **No score modifiers for assist.** The highscore is a personal record (`store.js:22-36`); the showcase audience plays once and ON-by-default is the right feel. Decision recorded; instrumented, not compensated.

## 2. HUD honesty contract — refines `game-brief.md:20` ("honest HUD")

"Honest" was operationalized as real state with change-gated writes (`combat.js:536`). Stage 6 restyles the presentation but extends the contract to every new element: a boss bar reads the same state the text line did (`BOSS.state()`), lock brackets reflect an actual lock, hit markers fire only on registered kills. Decorative HUD elements are forbidden — no element may show a value the harness cannot read from `combatState()`.

## 3. Audio decisions

- The CREDITS.md handoff's music `loop.ogg` is **dropped** by size decision (base64 would push the single-file build past the 6 MB ceiling). Music stays procedural: existing pads kept as the harmonic bed; one sparse sequenced pluck-arp layer (A-minor pentatonic over A2) and hats-only percussion added on top per `production/polish/audio-audit.md`.
- Victory gets a **jingle cue**, not music — recorded as an orchestrator call against the story-014 "new music out of scope" freeze (`phases.js:100`).
- Boss spawn gets a stinger; UI clicks and gunner fire get voices; the alarm keeps its own timbre family going forward (spec in `audio-audit.md`).

## 4. Controls text (forced rule)

T (lock toggle) appears in both places the rule requires: hint bar and CONTROLS panel (`full-3d-flight.md:42-46`; panel now lives at `src/hud.js:31-43` after the TD-003 move — the GDD's own ref at :96-99 is stale and superseded by this note).
