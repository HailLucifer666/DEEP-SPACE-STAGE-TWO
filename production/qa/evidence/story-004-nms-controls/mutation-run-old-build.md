# Mutation run — new probes against the OLD build (2026-11-03)

**Purpose:** the kee corollary — a test you have never seen fail is just a claim. The story-004/005
probe set was run against the story-002 build (world-axis strafe, velocity-derived heading) BEFORE
the rewrite, with a 2-line `combatState()` instrument (`speed: C.vel.length(), heading: C.heading`)
added to the old src and reverted after the run.

**Result: 16 passed (all overlay/phase asserts unaffected), 9 failed — every red for the stated
mechanism:**

```
PASS  boot → title
PASS  SKIRMISH → combat / reticle assembled / body.playing
PASS  W accelerates ≥14 u/s            [speed=17.0]        (old strafes at 17 too — not a discriminator)
PASS  W moves ship ≥15u                [d=31.6]            (ditto)
FAIL  W holds the nose (|Δh|<0.2)      [Δh=3.14]           nose flipped exactly π — the shipped camera-yank complaint, as a number
FAIL  cruise holds speed ±2            [Δs=16.6]           speed decayed 17→~0 (pursuit of own position)
FAIL  S brakes to ≤3                   [speed=17.0]        S is world +z strafe, not a brake
FAIL  A turns left in place            [Δh=-1.56 d=8.6]    strafed −x ~8.6u, heading −π/2 (sign inverted vs new scheme)
FAIL  D turns right in place           [Δh=3.13 d=6.3]     mirrored
FAIL  mouse right steers right         [Δh=-3.62 d=3.5]    translated toward pointer, heading sign inverted
FAIL  soft rim bleeds (≤13)            [maxRadial=29.8]    full-speed radial at r≈70 — square does nothing before 80
FAIL  boundary is a circle (r≤81)      [r=101.2]           square boundary — ship sat far outside any 80-circle
FAIL  rim slides (>5u)                 [d=2.1]             pinned dead at the corner — old code does NOT slide
PASS  death card appears / REPLAY → pad walk / single combat entry / SKIP → combat / CONSOLE []
```

**Prediction correction recorded:** "rim slides" was predicted green-on-old (wall slide); the run
showed it RED (d=2.1, hard pin at the square corner). The test file's mutation comment records the
measured result.

**Verification of the mutation itself:** the instrument was a 2-line additive edit to
`combatState()` (diff in story-004 commit message); the build ran the real game end-to-end
(16 overlay/phase asserts green, `CONSOLE []`) — the harness exercised the real flight code, not a
stub.
