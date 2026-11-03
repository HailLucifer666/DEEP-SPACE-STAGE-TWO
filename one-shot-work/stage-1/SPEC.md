# SPEC — Stage 1: the impression pass (stories 007–010)

Skill: one-shot | Rigor: LEAN | Output type: game | Pipeline: CCGS (dev-story → story-done per story) + kee discipline inside each story.

**Problem.** The game's first minutes undersell it: a 3–5 s main-thread stall during black
screen for every first-time player (localStorage probe, story-006), a 4.66 MB single file,
a render loop that skips the bloom pass it already imports, no music at all, and a blind
speed feedback loop (throttle state invisible — review r2 UX advisory).

**Users.** The Vi3W reviewer (first 60 seconds decide the take-home) and the player.

**In scope.** Four stories, each its own branch, evidence and merge:
1. story-007 lazy storage init + GLB quantize/prune (boot ≤ 2 s cold target)
2. story-008 bloom post chain wired, dpr-ladder aware
3. story-009 procedural music bed + low-hull alarm + proximity cue (Kenney if dropped in)
4. story-010 speed readout + headed gameover-sag verdict

**Out of scope.** Meshopt/Draco/KTX2; shadows/SSAO; spatial audio; boss/victory (Stage 2);
settings persistence (story-020); README/deploy (Stage 5).

**Acceptance criteria.** The numbered ACs inside `production/epics/combat-feel-fix/story-007..010.md`
are the contract — 5–6 checkable items each; every one must be [x] or explicitly DEFERRED
with a reason before story-done closes it.

**Success criteria.** All 4 stories COMPLETE with evidence receipts; flow-check 28/28 green
after every slice and on every merged master; boot-marks headed shows title ≤ 2 s cold
(post-007); the player's eyes/ears verdicts recorded for 007 (quantized ship), 008 (bloom),
009 (music); one-shot gate PASS.
