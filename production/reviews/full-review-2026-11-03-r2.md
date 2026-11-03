# Full Game Review r2 — STAGE TWO — 2026-11-03

Claude-Code-Game-Studios review pass #2, at `rigor: minimal`, `automation: guided` — target:
branch `story-004-nms-controls` (`8f350ff` story-003 wrap → `601d4a8` story-004 NMS controls →
`2d8341c` story-005 soft boundary → `c71b857` review fixes). This pass verifies that round 1's
two BLOCKING findings are actually dead and reviews the new controls/boundary surface with an
independent reviewer. Same honesty rule as r1: where a skill's official inputs don't exist, the
skill's verdict is recorded verbatim **and** a clearly-labeled implementer analysis covers the
real artifact. Companion files: `production/qa/smoke-2026-11-03-r2.md`,
`docs/tech-debt-register.md`, `.cache/kee-preflight/2d8341c-20261103-215500.md`.

## Verdicts at a glance

| Skill | Official verdict | Extra analysis |
| --- | --- | --- |
| project-stage-detect | **Production** · Confidence **PASS** | — |
| smoke-check (quick) | **PASS (quick)** — build + flow-check 28/28 + death-card 4/4, CONSOLE [] | — |
| code-review | **APPROVED WITH SUGGESTIONS** (on 2d8341c, by an independent reviewer) — 2 IMPORTANT findings **fixed same-day** in `c71b857`, re-probed green | Standards 5/6 (main.js >500 lines, pre-existing) |
| ux-review | **NOT ASSESSED** — no design/ux inputs | Extra: R1's two blocking UX defects verified fixed; new advisory: no speed/throttle readout |
| balance-check Combat | **NOT ASSESSED — NO DATA** (no data files) | Extra: **TUNABLE** — mobility profile changed, pressure math unchanged |
| asset-audit | **NOT ASSESSED — engine unresolved** (per contract) | Extra: zero new assets; GLB hash unchanged (48c2adb7…) |
| scope-check | **NOT ASSESSED — no committed baseline** (stopped honestly) | Extra: on-track; story-004/005 are user-directed asks |
| tech-debt scan | **NOT ASSESSED — code root unresolved** (strict, unchanged) | Register current: TD-011/012 **Closed**, 0 TODO/FIXME/HACK |

## Round-1 BLOCKING items — verified dead

1. **Stuck title on SKIRMISH** — fixed by story-001's `OVERLAY_ELMS` sweep; flow-check's SKIRMISH
   asserts (title hidden, HUD on, reticle assembled, body.playing) green on every run this round,
   plus the pad walk's hud-visible-at-every-phase asserts.
2. **WASD thrust invisible / camera yank** — superseded by story-004: the root cause (heading
   derived from velocity) is deleted, not patched. The mutation-run evidence records the old build
   flipping Δh=3.14 on W; the new build holds Δh=0.00. Impossible by construction now.

## Code review (independent reviewer, fresh context, read-only)

**Verdict on `2d8341c`: APPROVED WITH SUGGESTIONS**, 2 IMPORTANT + 7 advisory/nit findings. Per
the skill's verification mandate, both IMPORTANT findings were re-verified by the implementer
before adoption (R2-1 was already visible in the boost-probe transcript: speed 24.03→17.00 in one
sample window). **Both fixed in `c71b857`**, each guarded by a new probe that reds on the
unfixed code by construction; flow-check 25→**28 asserts**, all green on the fixed tree:

- **R2-1 (IMPORTANT, fixed):** boost expiry snapped 32.3→17 u/s in one frame — the W branch's
  `Math.min` clamp ran before any bleed while the comment promised brake-rate decay. Fix:
  reorder brake → expiry-bleed → accelerate (also removes the S double-brake arithmetic).
  Probe: "boost expiry bleeds (drop ≤25 u/s²)" — old code measures ~38, new 14.1.
- **R2-2 (IMPORTANT, fixed):** stale pointer steered forever — `mouseActive` was never cleared,
  the cursor is hidden in play, and position→rate steering turns a parked pointer into a
  permanent full-rate spin (the old model pursued a *point* and stopped). Fix: `pointerout`
  (relatedTarget null) + `blur` clear it. Probe: "pointer leave stops steering" (Δh=0.00).
- Advisories taken: `alive()` guards inside the boundary loops (a mid-probe death at timeScale
  0.3 could previously trivially pass the bleed/slide asserts) and a deterministic rim
  precondition (r≥72) before the slide measurement.
- Documented, not changed (deliberate): boost-meter flutter at the 0.12 gate (pre-existing
  pattern; ~0.2 u/s shimmer; hysteresis would settle it), per-frame `warn.textContent` write
  (pre-existing pattern), rim ring persists at opacity 0 across phases (now also
  `visible`-toggled), and the corrected invariant — **speed is the throttle state; |vel| equals
  it only outside the soft zone** (the camera trail reads actual motion, which is the intent).

**Held clean (reviewer-verified by trace):** heading wrap-around (all consumers periodic; NaN
chain closed upstream), bleed algebra incl. the r=0 skip (n̂ only computed for r>60), bounded
rim arrival (floor 3 → worst overshoot 0.15 u, re-clamped same frame), rim lifecycle across
REPLAY/SKIP (no stale glow; §8.6 containment holds with the new C.speed reset), bank-into-turn
sign (verified geometrically for Euler YXZ), boost semantics (S+Space, Space-without-W, S>W),
bolt/motion nose agreement, probe arithmetic vs the constants (thresholds carry margin, the
rimSamples guard blocks vacuous passes, cs() fields cannot tear).

## ADVISORY

- **Balance (extra analysis):** the mobility *profile* changed, the pressure math did not.
  Tightest circle is now v/ω: 7.7 u at cruise (17/2.2) — tight enough to orbit gunners inside
  their 16–24 u ring. Instantaneous lateral juke at cruise is slightly weaker than the old
  strafe (~4–7 u per 0.5 s hard turn vs ~8.5 u), and **full stops are ram-bait** (S + turn-in-
  place vs a 25 dmg rammer). Boost is a ~2 s burst at 32.3 (meter 0.45/s drain) — burst evasion,
  not sustained. EHP/TTK unchanged (150 vs ram 25 / bolt 12; regen 14/s). Watch wave 5+ where
  bolt pressure scales past regen — first tuning knob is TURN_RATE if dodging feels stiff.
- **UX (extra analysis):** R1's two blocking UX defects are gone; the new scheme is honestly
  documented in-game (hint bar + CONTROLS panel match the shipped behavior). New advisory: there
  is **no speed/throttle readout** — with "cruise holds speed" the player can't see that they're
  still at 17 u/s after releasing W; the boost meter exists but speed itself is invisible.
  Candidate: thin speed readout or throttle tick marks on the existing HUD bars.
- **Harness gaps (deliberate, flagged):** rim-ring opacity is not machine-probed (visual only);
  boost-release bleed-down had no committed assert until R2-1's probe landed (now covered).
- **Pre-existing, unchanged:** main.js 697 lines (>500 — TD-003 open), gameover-screen fps sag
  under software render (35–50 vs 60 in combat — visual/perf pass candidate).

## SCOPE (extra, caveat: baseline lives in chat history, not a committed file)

Frozen Must — done: Vi3W hero + derelict models ✓, cinematic launch ✓, combat core ✓.
Open: **README/deploy** and **boss fight + victory card** (P0, needs Vi3W models). Not started
(unchanged cuts): bloom, public link. Story-004/005 are user-directed additions (explicit live
complaints), consistent with the freeze rules. Net: **on track**; the branch is merge-ready
pending the user's feel check.

## Recommended build order

1. User feel check at localhost:8080 → merge `story-004-nms-controls` to master (green, tested).
2. Vi3W drone + boss models (P0 — needs assets from you), then victory card.
3. SFX/music handoff (CREDITS.md), optional speed readout (UX advisory), bloom, README + deploy.
