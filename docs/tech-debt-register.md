# Tech-Debt Register — STAGE TWO

Skill: `/tech-debt scan` · 2026-11-03.
**Code root note:** `engine.name` is unset (vanilla three.js web game — no engine row exists in
`directory-structure.md`), so the skill's strict verdict is `NOT ASSESSED — code root unresolved`.
The scan below ran with `src/` **manually accepted** as the code root — a documented deviation,
not a guessed resolution. Scan facts: TODO/FIXME/HACK/`@deprecated` count = **0**; files >500
lines: main.js (682); functions >50 lines: tickCombat, tickAscent, tickTransition, steer.

| ID | Category | Description | Files | Effort | Impact | Priority | Status | Added | Sprint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TD-001 | Architecture | Overlay lifecycle is per-phase ad-hoc; one missed hide = stuck layer (title stuck on SKIRMISH). Fix: central OVERLAY_ELMS sweep in setPhase + per-phase re-shows | src/main.js | S | Critical | 4.0 | Closed — story-001 | 2026-11-03 | — |
| TD-002 | Code Quality | Chase camera is position-only — cancels straight-line velocity, WASD thrust invisible in frame. Fix: velocity trail (camTarget −= vel·0.22), lag 6→5 | src/combat.js | S | High | 3.0 | Closed — story-002 | 2026-11-03 | — |
| TD-003 | Code Quality | main.js >700 lines (>500) — banners already split it, but PHASES+INPUT+LOOP could be modules (story-011 will do the split before the victory phase) | src/main.js | M | Med | 1.3 | Open | 2026-11-03 | — |
| TD-004 | Test | No game-test root (WAIVED at qa.level minimal) — critical paths live only in tools/*.mjs CDP harnesses; flow-check harness (SKIRMISH/REPLAY/SKIP paths) still unbuilt | tools/ | M | High | 2.0 | Closed — story-003 (flow-check 28 asserts, committed) | 2026-11-03 | — |
| TD-005 | Dependency | Framework hooks (.claude/hooks) are Claude-Code-specific — likely inert in this host; deny-list in settings.json unverified | .claude/ | S | Low | 0.3 | Accepted — protective if honored, inert if not | 2026-11-03 | — |
| TD-006 | Documentation | No design/game-brief.md — studio design skills key off it | design/ | S | Med | 1.0 | Closed — brief exists (2026-11-03) | 2026-11-03 | — |
| TD-007 | Dependency | Provisional git identity (arghya@users.noreply.github.com) on all commits — rewrite + re-point tags before repo goes public | .git | S | Med | 1.0 | Open | 2026-11-03 | — |
| TD-008 | Architecture | ~400 MB Edge profile litter in build/ (cdp-check profiles, gitignored) — delete on user go-ahead | build/ | S | Low | 0.3 | Accepted — awaiting user | 2026-11-03 | — |
| TD-009 | Performance | Edge pip transform strings allocated per raider per frame (≤8/frame — acceptable; gate if pip count grows) | src/combat.js | S | Low | 0.3 | Open | 2026-11-03 | — |
| TD-010 | Code Quality | transition.js tunnel canvas texture never disposed (material is; texture leaks once per session) | src/transition.js | S | Low | 0.3 | Open | 2026-11-03 | — |
| TD-011 | Code Quality | Heading derived from velocity (`heading = atan2(vel)`) — player never commands the nose; W flipped the view 180°. Fix: commanded yaw + throttle state (story-004) | src/combat.js | M | Critical | 3.5 | Closed — story-004 (probes red-on-old) | 2026-11-03 | — |
| TD-012 | Architecture | Arena clamp is a hard invisible SQUARE (±80) — ship pins at full thrust over streaming ground (the repeat "stuck at the edge" class; ARENA_HALF already 3x'd once). Fix: soft circular boundary + visible rim (story-005) | src/combat.js | S | High | 2.5 | Closed — story-005 (probes red-on-old) | 2026-11-03 | — |
| TD-013 | Robustness | Bloom's never-crash catch covers CONSTRUCTION only — a render-time failure (HalfFloat targets on a WebGL2 context lacking EXT_color_buffer_float) would throw mid-frame uncaught, probe still reading 'bloom'. Verified against three 0.187 sources; low real-world probability (desktop hardware-accelerated audience). Fix path: wrap the composer render call, degrade to direct render on first throw | src/main.js | S | Low | 0.3 | Accepted — stage-1 review ADVISORY; fix named, do with Stage 2 render work | 2026-11-04 | — |
| TD-014 | UI | Stale `#tele` content rides the pad for ~2.6 s after REPLAY (SPD line written by combat persists into the pad phase until cruise rewrites it) — pre-existing stale-tele class, cosmetic | src/main.js | S | Low | 0.3 | Accepted — stage-1 review ADVISORY; fix rides with Stage 2 HUD work (boss HP bar) | 2026-11-04 | — |
| TD-015 | Robustness | makeMusicBag runs un-guarded inside phase-enter hooks — a WebAudio exception there would abort a phase transition (never-crash contract edge). Low probability (bag creation only runs on a live context; ensure() guards the context path). Fix path: try/catch inside musicTo with a one-line warn + 'none' state | src/audio.js | S | Low | 0.3 | Accepted — stage-1 review ADVISORY; fix named, do with Stage 2 audio work | 2026-11-04 | — |

Prioritized: TD-011 (closed) → TD-012 → TD-001 → TD-002 → TD-004 → TD-003 → TD-006 → TD-007 → TD-005/TD-008/TD-009/TD-010. Stage-1 additions (2026-11-04 review): TD-013/014/015 accepted with named fixes, ride Stage 2.
`workflow: minimal` — no sprints; "Sprint" column uses — and next-work is the brief's build order.
