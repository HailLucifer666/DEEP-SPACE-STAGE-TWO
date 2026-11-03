# Tech-Debt Register — STAGE TWO

Skill: `/tech-debt scan` · 2026-11-03.
**Code root note:** `engine.name` is unset (vanilla three.js web game — no engine row exists in
`directory-structure.md`), so the skill's strict verdict is `NOT ASSESSED — code root unresolved`.
The scan below ran with `src/` **manually accepted** as the code root — a documented deviation,
not a guessed resolution. Scan facts: TODO/FIXME/HACK/`@deprecated` count = **0**; files >500
lines: main.js (682); functions >50 lines: tickCombat, tickAscent, tickTransition, steer.

| ID | Category | Description | Files | Effort | Impact | Priority | Status | Added | Sprint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TD-001 | Architecture | Overlay lifecycle is per-phase ad-hoc; one missed hide = stuck layer (title stuck on SKIRMISH). Fix: central OVERLAY_ELMS sweep in setPhase + per-phase re-shows | src/main.js | S | Critical | 4.0 | Open | 2026-11-03 | — |
| TD-002 | Code Quality | Chase camera is position-only — cancels straight-line velocity, WASD thrust invisible in frame. Fix: velocity trail (camTarget −= vel·0.22), lag 6→5 | src/combat.js | S | High | 3.0 | Open | 2026-11-03 | — |
| TD-003 | Code Quality | main.js 682 lines (>500) — banners already split it, but PHASES+INPUT+LOOP could be modules | src/main.js | M | Med | 1.3 | Open | 2026-11-03 | — |
| TD-004 | Test | No game-test root (WAIVED at qa.level minimal) — critical paths live only in tools/*.mjs CDP harnesses; flow-check harness (SKIRMISH/REPLAY/SKIP paths) still unbuilt | tools/ | M | High | 2.0 | Open | 2026-11-03 | — |
| TD-005 | Dependency | Framework hooks (.claude/hooks) are Claude-Code-specific — likely inert in this host; deny-list in settings.json unverified | .claude/ | S | Low | 0.3 | Accepted — protective if honored, inert if not | 2026-11-03 | — |
| TD-006 | Documentation | No design/game-brief.md — studio design skills key off it | design/ | S | Med | 1.0 | Open | 2026-11-03 | — |
| TD-007 | Dependency | Provisional git identity (arghya@users.noreply.github.com) on all commits — rewrite + re-point tags before repo goes public | .git | S | Med | 1.0 | Open | 2026-11-03 | — |
| TD-008 | Architecture | ~400 MB Edge profile litter in build/ (cdp-check profiles, gitignored) — delete on user go-ahead | build/ | S | Low | 0.3 | Accepted — awaiting user | 2026-11-03 | — |
| TD-009 | Performance | Edge pip transform strings allocated per raider per frame (≤8/frame — acceptable; gate if pip count grows) | src/combat.js | S | Low | 0.3 | Open | 2026-11-03 | — |
| TD-010 | Code Quality | transition.js tunnel canvas texture never disposed (material is; texture leaks once per session) | src/transition.js | S | Low | 0.3 | Open | 2026-11-03 | — |

Prioritized: TD-001 → TD-002 → TD-004 → TD-003 → TD-006 → TD-007 → TD-005/TD-008/TD-009/TD-010.
`workflow: minimal` — no sprints; "Sprint" column uses — and next-work is the brief's build order.
