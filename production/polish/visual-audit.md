# STAGE TWO — Stage 6 Visual Audit

Ranked by player impact. Every load-bearing ref spot-checked on disk, 2026-11-08. Companion scope:
`production/polish/scope.md`. Effort: S / M / L. This is a working brief for the builders.

## F1 — Combat HUD is present but thin (highest impact)

**Evidence.**
- The entire combat readout is a monospace text stack: `#hud-bars` / `#hud-score` / `#hud-chips`
  (`tools/index.template.html:196-198`). HULL/SHIELD/BOOST render as text lines with inline div
  bars via change-gated innerHTML (`src/combat.js:536-547`); SCORE/WAVE as one text line
  (`src/combat.js:548-551`); effect chips as text spans (`src/combat.js:555-562`).
- Boss HP is a TEXT line spliced into that same write: `BOSS.barLine()` returns
  `BOSS ▍▍▍ 62%` as a string (`src/boss.js:388-392`), embedded at `src/combat.js:540` and `:545`.
  No dedicated bar element exists for the fight's central state.
- Missing entirely: no wave banner, no hit markers, no radar. Positional awareness is 8 runtime
  edge pips (`src/combat.js:183-193`, 14px clip-path triangles, opacity-driven).
- HUD is machine-verified visible in combat (`tools/flow-check.mjs:98-104` asserts `#hud` unhidden,
  reticle assembled, body.playing) — this is a rebuild of thin-but-working chrome, not a bug hunt.

**Why it matters.** Combat is the whole game, and every state the game tracks is number-first text.
A glance mid-dogfight cannot decode it, and the boss encounter — the highest-stakes moment — has
the least readable presentation of anything. The game-brief's "honest HUD" pillar is satisfied
honestly but read poorly.

**Fix.** Rebuild `#hud` as meters/chrome: bar meters with labels for HULL/SHIELD/BOOST, a dedicated
boss HP bar element fed by `combatState().boss`, a wave banner, kill-only hit markers. Honesty law
applies to every element; element-budget law gives each one meaning.

**Effort: L. Risk: M** — touches the change-gated write paths and the `clearCombat` reset list;
flow-check asserts on `#hud-bars`/pips state must be migrated, not deleted.

## F2 — Title screen: pro shell, amateur tells

The title is among the most-seen screens (core loop is die → card → replay, `design/game-brief.md:8,12`).
The shell is already pro: Orbitron/Rajdhani via FontFace data URLs (`src/assets.js:6-14`), gradient
`.brand` (`tools/index.template.html:77-80`), `.pill` hover/focus states (`:83-89`), live 3D backdrop
orbit (`src/loop.js:57-62`). The tells:

1. **No favicon anywhere.** Template head `tools/index.template.html:1-7` has no `<link rel="icon">`;
   none registered in src. The browser tab shows the default file icon. Effort: S. Risk: S.
2. **Dev chip on the player-facing top bar.** `BUILD S4 · VI3W POWERED` sits in shipped chrome
   (`:241`, `.t-ver`). Reads as a debug stamp in a showcase build. Effort: S. Risk: S.
3. **Controls hint is one dense all-caps run-on.** Twelve bindings in a single 11px line (`:256`).
   Unreadable at title distance; nobody parses it. Effort: S. Risk: S.
4. **Pause card is text-only.** `<h2>PAUSED</h2><p>P / ESC to resume · M mute</p>` (`:201`) — no
   chrome, inconsistent with every other card. Effort: S. Risk: S.
5. **Death/victory cards are plain text rows** (`:202-218`) — the highest-traffic screens in the
   game (`game-brief.md:8,12`) get the least design. Effort: M. Risk: S.
6. **RECORD 0 / HIGH SCORE 0 flash before storage warms.** `readHighscore()` returns 0 pre-warm
   (`src/store.js:24-25` — "title renders 0, warm-up re-renders the real value"; by design). The
   record element visibly rewrites on warm. Suppress the initial paint (render `—` or hold hidden
   until warm) so the record never visibly changes. Effort: S. Risk: M — must not break the warm
   re-render (KEEP-PASSING).

## F3 — Element crowding at the reticle

**Evidence.** The reticle is 132px riding the pointer (`tools/index.template.html:132`,
`src/combat.js:578-586`) and already carries the charge ring (`src/combat.js:567-576`). Edge pips
orbit at 130px radius around screen center (`src/combat.js:590`) — the same footprint whenever the
pointer is near center. The planned pipper, lock brackets, and hit markers all want the same focal
zone.

**Why it matters.** Crowding degrades exactly what Stage 6 exists to create: glance-readability.
The reticle is the player's eye anchor; every addition must justify its pixels or the anchor
becomes noise.

**Fix / budget rules for all new elements.**
- **Pipper renders only while diverging.** Appears past a divergence threshold from the reticle,
  points along the true bolt path, self-hides when aligned. It must not become a permanent second
  reticle (element-budget law: reticle = steer/charge, pipper = bolt path).
- **Hit markers are kill-only**, ~150 ms life, then gone. No per-hit damage markers.
- **Lock brackets are cyan.** Amber is this game's hot/danger language (elite tint
  `src/enemies.js:36`, boss node amber by design `src/boss.js:14-18`); amber brackets would read
  "elite/boss", not "locked target".
- **No clip-path polygons on any new element.** `tools/flow-check.mjs:658-667` counts `#hud`
  children by clip-path to assert pips drained (`pipCount === 8`, `pipsOn === 0`); a new polygon
  element corrupts that count and turns a passing suite red for the wrong reason.

**Effort: M per element. Risk: M** — all four rules are enforceable in flow-check; bake the asserts
in with the elements.

## F4 — Hard constraints for all HUD work (rules, not findings)

- **Change-gated DOM writes only** — the `src/combat.js:536-547` pattern: compute, compare to a
  cached last value, write on diff. No per-frame innerHTML churn, for new elements as for old.
- **`clearCombat` reset list grows for every new element**, each with a drained assert in
  flow-check. Existing pattern to extend: bars/score/chips empties (`src/combat.js:635-637`),
  reticle charge-state reset (`:638-641`), pip opacity drain (`:645-647`), asserted drained at
  `tools/flow-check.mjs:667-668`.
- **Combat meters stay combat-only.** `clearCombat` empties `#hud-bars` so pad phases don't
  inherit stale bars (`src/combat.js:635-637`); `#tele` is combat/cruise-owned (TD-014,
  `src/combat.js:643-644`). New elements follow the same ownership rule.

## KEEP-PASSING LIST

These pinned behaviors must survive H1/T1 unchanged — flow-check keeps them green:

- **Charge ring** — reticle ring fill 0→1 over T_CHARGE, flash at crossing
  (`src/combat.js:567-576`).
- **Effect chips** — one per active effect, name + whole seconds left, change-gated
  (`src/combat.js:555-562`).
- **Reticle assembly** — lock-in animation + pointer ride (`tools/index.template.html:132-134`,
  `src/combat.js:578-586`).
- **RECORD element** — pre-warm 0 then warm re-render of the high score (`src/store.js:24-25`,
  `tools/index.template.html:261`). F2-6 changes the initial paint, not this contract.
- **Overlay sweep** — a phase change hides every overlay; entering phase re-declares what it shows
  (`src/hud.js:83-84`).
- **Mute battery** — M mute and the `[ SOUND: ON ]` pill (`tools/index.template.html:252`, pause
  card `:201`).
