# STAGE TWO — Stage 6: Experience Polish — Chair Scope

Status: owner-approved plan, 2026-11-08. Findings and evidence live in the companion doc
`production/polish/visual-audit.md` (all line refs spot-checked against disk). GAME_ROOT: `E:\Game Build`.

Stage 6 is an experience pass: presentation, readability, feel chrome, sound. It changes how the
existing game reads and sounds — it does not change what the game is or any number in it.

## In scope

1. **HUD rebuild.** Replace the monospace text-stack combat readout with readable chrome:
   bar meters for HULL/SHIELD/BOOST, a dedicated boss HP bar (the boss line is currently text
   spliced into `#hud-bars`), a wave banner, kill-only hit markers, positional awareness beyond
   the edge pips. Every new element obeys the two standing laws below.
2. **Title / UX pro pass.** Favicon; remove the dev chip from the player-facing top bar; break
   the controls run-on into readable groups; chrome the pause card; give the death/victory cards
   layout weight; suppress the RECORD 0 / HIGH SCORE 0 pre-warm flash.
3. **Audio overhaul.** The full sound picture: no clipping, no pumping, consistent levels across
   the whole battery (SFX + ducked music), mute behavior unchanged.
4. **Aim assist + pipper.** A pipper that renders the true bolt path when it diverges from the
   reticle, lock brackets on the lock target, hit markers on kills. Sight and bolt path must
   agree visually.

## Out of scope

- **Balance tuning of any kind**: bolt speed, bolt damage, drop rates, wave tables, elite
  chance/scale curves, TTK. Stage 6 changes presentation, not numbers.
- **Boss lockability** — boss fight mechanics stay as shipped.
- **Score modifiers.**
- **Level / economy design.**
- **Repo publication / deploy** — README and public link are a later stage.

## What "better" means (measurable)

- **HUD readable at a glance in combat.** Hull, shield, boost, boss HP read as bar/shape state in
  under a second mid-fight; numbers become secondary labels. Testable: the honesty law makes every
  value derivable from `combatState()`, so flow-check can assert DOM reads machine state.
- **Sight and bolt path agree visually.** Pipper invisible when bolt path and reticle align; appears
  only past a divergence threshold, pointing along the true bolt path; self-hides on re-alignment.
- **Sound has no clipping or pumping.** Nothing rails at max; no audible gain pumping on overlapping
  SFX with ducked music; one battery pass across max simultaneity confirms it.
- **Boot stays in envelope.** New HUD elements are static DOM with change-gated writes — zero
  per-frame layout churn added; boot/first-frame timing unchanged.
- **Regression floor.** flow-check suite stays green; every behavior on the visual-audit KEEP-PASSING
  LIST survives H1/T1 unchanged.

## Standing laws — player-facing, non-negotiable

**(a) HONESTY LAW.** Every new HUD element renders state, never decoration. No element may show a
value the harness cannot read from `combatState()`. If the machine state can't express it, the
element doesn't render it.

**(b) ELEMENT-BUDGET LAW.** One meaning per element. Ownership is exclusive:

| Element | Owns the meaning of |
|---|---|
| reticle | steer / charge |
| pipper | bolt path |
| bracket | lock target |
| edge pips | off-screen threats |

A new element must claim a meaning not already owned. Two elements may never encode the same state.

## Hard build constraints (evidence in visual-audit.md F4)

1. Change-gated DOM writes only — the `combat.js:536-547` pattern (compute, compare to last, write
   on diff). No per-frame innerHTML churn.
2. The `clearCombat` reset list grows for every new element, each with a drained assert in
   flow-check — pad phases must never inherit combat state.
3. Combat meters stay combat-only: `clearCombat` empties `#hud-bars` (`combat.js:635-637`);
   `#tele` is combat/cruise-owned (TD-014, `combat.js:643-644`).
4. No clip-path polygons on any new HUD element — flow-check counts `#hud` children by clip-path
   to assert pips drained (`tools/flow-check.mjs:658-667`).
5. Color language: amber is this game's hot/danger signal (elite tint `src/enemies.js:36`, boss
   node `src/boss.js:14-18`). Lock brackets are cyan. Amber brackets would read "elite/boss".
