# Full Game Review — STAGE TWO — 2026-11-03

Claude-Code-Game-Studios review pass: 8 skills executed at `rigor: minimal`, `automation: guided`.
Where a skill's official inputs don't exist (this code-first project predates the framework), the
skill's own honest verdict is recorded **and** a clearly-labeled implementer analysis covers the
real artifact. Companion files: `production/project-stage-report.md`,
`production/qa/smoke-2026-11-03.md`, `docs/tech-debt-register.md`.

## Verdicts at a glance

| Skill | Official verdict | Extra analysis |
| --- | --- | --- |
| project-stage-detect | **Production** · Confidence **PASS** | — |
| smoke-check (quick) | **PASS (quick)** — build + 5 critical paths green, CONSOLE [] everywhere | — |
| code-review | **CHANGES REQUIRED** — 2 blocking user-facing defects | Standards 5/6, game-specific clean |
| ux-review | **NOT ASSESSED** — no design/ux inputs | Extra: **NEEDS REVISION** (advisory) — implemented UI |
| balance-check Combat | **NOT ASSESSED — NO DATA** (no data files) | Extra: **CONCERNS** — early-wave bolt pressure ~0 |
| asset-audit | **NOT ASSESSED — engine unresolved** (per contract) | Extra: inventory clean, budget 4.65/8 MB |
| scope-check | **NOT ASSESSED — no committed baseline** (stopped honestly) | Extra: on-track; 2 frozen Must items open |
| tech-debt scan | **NOT ASSESSED — code root unresolved** (strict) | Register written with src/ manually accepted |

## BLOCKING (player-facing, fix before anything else)

1. **Stuck title on SKIRMISH** — `src/main.js` `PHASES.combat.enter` (~line 101) never hides
   `#title`; `setPhase` runs the new phase's exit (exit-before-enter), so every overlay hides
   only if the entering phase remembers. Third instance of the class (death card was the first).
   Fix: central OVERLAY_ELMS sweep in `setPhase` + per-phase re-shows. Evidence: user screenshot
   + code path.
2. **WASD thrust invisible** — `src/combat.js:278-282` chase-cam target is position-only:
   `camTarget = pos − forward·7.5 + 3.4y` matches the ship's velocity exactly, parking it
   dead-center at any speed. Input recording + steer math verified correct (keys reach
   `input.keys`, kb branch wins over mouse) — the movement exists but can't be seen. Fix:
   velocity trail `camTarget −= vel·0.22`, lag 6→5. Related: `hudAssemble(true)` missing on
   the SKIRMISH path — no crosshair without transition B2.

## ADVISORY

- **Balance (extra analysis):** wave 1–2 bolt pressure ≈ 0 — a lone gunner's sustained DPS
  (~6.3) is outpaced by shield regen (14/s); rams carry all early pressure. By wave 5+
  (share `max(0.25, 0.7−0.08w)` → gunner-heavy, count 10+) pressure scales past regen. TTK
  healthy: raider hp 1–2 vs player 8 dmg/s (rammer ~0.13 s, gunner ~0.25 s); player EHP 150
  vs ram 25 / bolt 12 → 6 rams or ~13 bolts to die. Score economy fine (100 rammer / 150
  gunner / 150×wave bonus). Tune later, not broken.
- **UX (extra analysis):** implemented UI strengths — pointer-tracking reticle, edge pips,
  hit veil, honest HUD, death-card recovery all live. Weaknesses: the two BLOCKING items;
  color-blind single-channel pips (red-only, shape-only differentiation is good but opacity
  is the only scale); controls discoverability good (hints + CONTROLS panel).
- **Code review details:** main.js 682 lines (>500) — split candidates PHASES/INPUT/LOOP;
  pip transform strings allocate per raider per frame (≤8 — fine); tunnel canvas texture never
  disposed (one per session); everything else clean — dt clamped + NaN-guarded, hot-path
  allocations hoisted, §8.6 cleanup proven by restartProbe clean:true, 0 TODO/FIXME/HACK.
- **Assets:** hero GLB 1,398,196 B (sha256 48c2adb7… — matches SHIP1 record), derelict GLB
  1,574,448 B, 3 woff2 fonts 37.3 KB (OFL, CREDITS.md), index.html 4.65/8 MB. Naming INFO:
  `output.glb` is generic — rename to `hero-ship.glb` at the next build-token touch.

## SCOPE (extra, caveat: baseline lives in chat history, not a committed file)

Frozen Must — done: Vi3W hero + derelict models ✓, cinematic launch ✓, combat core ✓.
Open: **README/deploy** and **boss fight + victory card** (P0, needs Vi3W models).
Not started (unchanged cuts): bloom, public link. Cut list respected — no Burster/Elite/
leaderboard/touch. User-directed additions since freeze (rift/logo, title overhaul, raiders,
pips, fonts) are all justified by explicit asks. Net: **on track**, the two open Must items
are the take-home's remaining risk.

## Recommended build order

1. Overlay sweep + WASD velocity-trail cam + flow-check harness (the 2 BLOCKING items —
   plan already designed, ~1 h).
2. Vi3W drone + boss models (P0 — needs assets from you), then victory card.
3. SFX/music handoff (CREDITS.md), bloom, README + public deploy.
