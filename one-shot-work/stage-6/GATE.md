# GATE — Stage 6 (experience polish)

Run 2026-11-09 on branch `polish/stage6-experience` HEAD `04716f2` (story chain T1
`0dfeacc` → W1 `2b22ba0` → H1 `51fd172` → A1 `04716f2`). Machine gates: PASS.
Merge to `master`, the close tag, and every experiential verdict: open on the
player's word (below).

- [x] Every acceptance criterion in the story cards met or honestly dispositioned —
      PASS: per `production/polish/polish-plan.md` cards T1/W1/H1/A1a/A1b. Machine-
      verified: pause cursor restore (mutation-proved: class removed → exactly the
      cursor assert red), fire-path baseline (real CDP input through
      `Input.dispatchMouseEvent` → `fireTick` → `spawnStreamShot` → `spawnBolt` — the
      harness's former structural blind spot, closed), bias ≤6° reading
      `b.userData.dir` (mutation: clamp removed → 10.32° red), outside-cone never
      locks (mutation: cone 180° → red), boss-bar lifecycle + never-0%-while-dying,
      voice-cap peak ≤ 24 (mutation: refusal removed → 35 red), sequencer counter
      monotonic + stalls while muted + resumes in phase, `?sfxFault=1` fallback per
      cue with zero console noise. EXPERIENTIAL verdicts OWED to the player's
      playtest (pipper feel, lock feel, music feel, title/cards look) — same
      revocable-at-any-commit disposition as stage-5's look/feel verdicts.
- [x] Regression: all earlier tests still pass — PASS: flow-check 190 → 201 → 232 →
      242 → 255, 0 failed on the story HEAD, twice consecutively for the A1 close +
      once more by the orchestrator. Byte-intact except the SANCTIONED rewrites
      (boss text-line asserts `flow-check.mjs` + `probes.js:155` + harness sampling,
      each carrying 2026-11-08 provenance and exact-coverage mapping) — no other
      semantic assert change; keep-passing list held (charge ring, chips, reticle
      assembly, RECORD, overlay sweep, mute battery, story-020, TD-013/015 probes).
- [x] The documented run path executed — PASS: build 4.70 MB → dep-check acyclic
      271/500 (+ the new aim-assist import-direction rule) → flow-check 255/0
      CONSOLE [] → boot-marks 478 ms headed → combat-probe 6/6 with the NaN-scan
      extended — `production/qa/smoke-2026-11-09-stage6.md`.
- [x] Performance basics — PASS: main.js 271/500; no src file ≥ 800 (audio.js ~640
      after the overhaul, sequencer split to `music-seq.js` per the convention;
      combat.js 788); boot 221–1086 ms observed across the stage, inside the
      documented ≈0.3–2.5 s envelope; single-file deployment preserved (4.70 MB ≤
      the 6 MB ceiling; samples lazy-decoded — zero audio work before the title
      mark).
- [x] Known limitations listed honestly — PASS (carry-forwards + stage additions):
      * TD-016 Edge-binary pin (override used everywhere; dynamic resolution still
        open). TD-017 OVERDRIVE residual stall class — observed 2× in ~8 A1 runs,
        0× in the closing greens; rerun policy stands. TD-007/TD-008/TD-018 ship-
        checkpoint items UNANSWERED (carried from stage 5, working defaults HOLD).
      * Headless-Edge Math.random run-level batching: root cause still open
        (mechanism gates + 99%+ bands remain the shipped answer).
      * Kenney pack revision ships no warp/confirmation files — pickup/ui are the
        recorded closest matches (`stage6-a1/pack-manifest.md`).
      * The pipper's visibility gate rides pointer divergence (input state, the
        same class as the pre-law reticle); the honesty surface
        `combatState().pipper` exposes it for the harness (H1 rider).
      * Charged bolts carry no bias (deliberate: the manual-aim reward, stage-6
        GDD §1); boss lockability excluded by design (GDD §1) — both re-openable
        only by a recorded decision, not a flag flip.
- [x] No false greens — PASS: every red recorded with its mechanism (T1 192/9,
      W1 207/25, H1 230/12, A1 244/11 + six post-green mutations + one discarded
      vacuous mutation attempt + one mis-applied mutation kept on file); the
      harness was altered only by the sanctioned boss-line rewrites (provenance
      recorded), the new pages/asserts, the one-time
      `Page.addScriptToEvaluateOnNewDocument` capability (T1, contained to the
      seeded-record page), and dep-check's new import-direction rule.

RESULT: **PASS (machine gates)** — open on the player's word: (1) the headed
playtest (HUD/pipper/lock feel, title/cards/pause look, audio mix) → merge click;
(2) the close tag (`good-2026-11-09-stage6` or dated equivalent) with the merge;
(3) the carried stage-5 ship-checkpoint items (deploy go, TD-007, TD-008, TD-018,
repo publication) remain UNANSWERED and untouched by this stage. The gate reduces
risk; it does not prove the absence of bugs.
