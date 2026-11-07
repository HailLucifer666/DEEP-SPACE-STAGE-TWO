# GDD: Stage 4 — Charged Shot, Pickups, Elites, Wave Tables, Telemetry (stories 018 / 019)

> **Epic**: combat-feel-fix (Stage 4 — balance + telemetry)
> **Status**: Proposed (design source for story-018, story-019; scope of both stories LOCKED 2026-11-04/05 and recorded in the story files — this GDD parameterizes that scope and resolves the open design decisions, it does not re-litigate it)
> **Approved scope lines**: `production/epics/combat-feel-fix/story-018-charged-shot-pickups.md` L17-22; `production/epics/combat-feel-fix/story-019-elites-waves-telemetry.md` L12-13 (boss reward = **1000 flat, LOCKED, non-negotiable**)
> **Grounding**: `design/game-brief.md`, `src/combat.js`, `src/enemies.js`, `src/drone.js`, `src/boss.js`, `src/input.js`, `src/pool.js`, `src/probes.js`, `src/phases.js`, `one-shot-work/HANDOFF.md` L219-231, `tools/flow-check.mjs`, `design/gdd/full-3d-flight.md`
> **Last Updated**: 2026-11-05

---

## 1. Overview

Stage 4 adds two player-facing systems and two designer-facing systems to a combat core that is
already shipped and harness-pinned. Player-facing (story-018): the single fire trigger gains a
**charged second stage** — hold past a threshold and the ~8/s stream (`FIRE_INTERVAL = 1/8`,
`src/combat.js` L56) suppresses into a charge that releases one heavy bolt — and killed enemies
**drop pickups** (SPREAD / OVERDRIVE / SHIELD, the verbatim inherited spec at
`one-shot-work/HANDOFF.md` L227). Designer-facing (story-019): raiders gain **elite variants**
from wave 4 (inherited spec, `one-shot-work/HANDOFF.md` L226), early-wave composition becomes
**table-driven** with the derived formulas as fallback (the deferral story-012 recorded), the
boss death **awards a flat 1000** (LOCKED by the player; today it awards nothing —
`src/combat.js` L329 states the silence), and an **event-driven telemetry accumulator** makes
every later retune evidence-driven. The load-bearing design problem is that hold-to-fire and
hold-to-charge compete for the same button: §3.1 resolves it with a threshold model that keeps
every short-tap behavior bit-identical to today, so the existing fire asserts survive and the
"obvious controls" pillar (`design/game-brief.md` MVP 4, closing line) is never asked to learn
a new input.

**One premise correction up front**: the fire trigger is **LMB only**. The dispatch brief and
older docs say "LMB/Space"; Space has been boost since the 2026-11-03 rebind and the code
comment is explicit — `if (e.code === 'Space') { e.preventDefault(); input.boost = true; }
// Space = boost (rebind 2026-11-03); fire is LMB-only` (`src/input.js` L39). Every decision
below treats LMB as the sole fire surface.

**Scope note against the stage-2 brief**: `design/game-brief.md` L26 lists "No
Burster/Elite/powerups" as out of scope. That line recorded stage-2 scoping; stages are
sequential scope decisions, and the player's locked 2026-11-04/05 record (story-018/-019
Provenance sections) supersedes it for elites and powerups. Burster, leaderboard, touch
controls and the settings page stay out — nothing here re-admits them.

## 2. Player Fantasy

**What the player should feel**:

- **The trigger has a second stage (charged shot)** — the moment the stream they already trust
  tightens into a whine and they release something *heavier*. MDA: **Challenge/Competence** —
  the charged shot is a skill-expression layer built *inside* an input the player already
  knows, not a new control to learn; **Sensation** — the whine, the thump, the amber bolt
  reading hot under the shipped bloom chain (the raider trim already glows emissive,
  `src/enemies.js` L33). **Discovery** — nothing tutorials it; the threshold moment teaches
  itself (§3.2, the whine starts exactly at the crossing).
- **The battlefield remembers your kills (pickups)** — aggression feeds back: clear a wave and
  the field sprouts glowing answers. SDT **Competence**: the HUD chip with seconds left is
  readable feedback that the power is *yours, on a clock* — the player always knows why a
  plan worked or ran out.
- **The field notices you're good (elites)** — from wave 4 the arena answers back with amber
  variants of shapes the player has already mastered. The 0xffa02f family is deliberately the
  boss node's language (`src/boss.js` L89, node color 0xffc85a, amber halo) — *hot = dangerous*
  stays one consistent visual grammar.
- **Anti-fantasy (what we are NOT building)**: a weapon-switching game. There is no second
  weapon, no loadout, no mode toggle — one trigger whose hold depth is the only new dimension.
  Combos/multipliers stay out (HANDOFF L228 was not recovered into Stage 4; combo is not in
  either locked story).

**Pillar alignment**: "controls that FEEL right" (`design/game-brief.md` MVP 4) — the charged
shot lives inside the existing trigger, so the default answer (press = shoot) never changes;
"smooth, never stuck, obvious controls" (brief, closing line) — discovery is progressive and
untaught-but-findable, gated experientially (§8.5). Telemetry has **no** player fantasy — it is
the studio's instrument and ships zero player-visible UI (story-019 L42-43).

## 3. Detailed Design

### 3.1 The keystone: one trigger, two stages (the fire-binding decision)

Today `fireTick` (`src/combat.js` L274-285) reads `C.api.input.fire` (LMB held,
`src/input.js` L61-63) and spawns a bolt every `FIRE_INTERVAL = 1/8` s (L56). The charged shot
needs hold time on the same button. Three candidate shapes were considered; the full
options/consequences analysis is §9 Decision 1. **The design lands on shape (a) —
threshold spray-then-charge**:

- **Hold starts the stream exactly as today.** The first bolt still fires on the press frame
  (`C.fireT = 0` at combat entry, `src/combat.js` L452; fireTick decrements then fires while
  `fireT ≤ 0`) — a tap is bit-identical to the shipped build.
- **At `T_CHARGE = 0.6 s` of continuous hold, the stream suppresses** — no further stream bolts
  fire — and the charge meter fills toward full. The charge whine (audio, §3.2) starts at this
  crossing: the game itself announces "holding longer does something".
- **Release at/after the threshold fires exactly one charged bolt** (`CHARGE_DAMAGE = 6`,
  §3.2) through the existing spawn path (`noseWorld` + `forward`, `src/combat.js` L279-283
  pattern), then the hold accumulator resets. Release-to-bolt latency is ≤ 1 frame (the
  pointerup flips `input.fire` at window level, `src/input.js` L64-66; fireTick observes it
  next tick).
- **Release before the threshold fires nothing extra** — the stream already did the work. There
  is no partial-charge bolt and no fractional damage.
- **Suppression is the balance hinge, not a tunable.** If the stream kept firing *alongside*
  the charge, the charged shot would be a free additive nuke (dominant strategy, Sirlin's
  degenerate-play test) and the hold would carry zero decision. The threshold sacrifice —
  give up `T_CHARGE`-worth of stream DPS to bank one heavy bolt — is the actual choice.

**Why this shape wins for the pillars**: the "obvious controls" pillar is never billed a new
input — charge is a *discovered extension* of an already-learned one; "controls that FEEL
right" keeps the tuned shipped stream feel intact below the threshold. And for the harness:
every assert that drives short taps or sub-threshold holds survives verbatim (§8.1).

### 3.2 Charged shot — parameters

| Parameter | Value | Grounding / rationale |
|---|---|---|
| `T_CHARGE` (charge threshold) | **0.6 s** | Below one gunner-pass of spray (gunner fire cadence 1.6-2.2 s, `src/enemies.js` L179); above the tap zone (~0.1-0.25 s). 5 stream bolts land during the approach (t = 0, .125, .25, .375, .5). |
| Regular bolt damage | **1** | The real number: every hit call passes literal 1 — raider `ENEMIES.hitDrone(d, 1)` (`src/combat.js` L302), orb `DRONES.hitOrb(o, 1)` (L319), boss `BOSS.hitBoss(1, …)` (L337). |
| `CHARGE_DAMAGE` | **6** | Elite gunner (HP 2×3 = 6) one-shots; boss weak point 6×`WEAK_MULT`(3) = 18 → 4 aimed charged hits kill the 60-HP boss (`src/boss.js` L35, L51); charged DPS ≈ stream DPS (§4.2 parity anchor). |
| Charged bolt identity | Same pool, same speed | Rides `C.bolts` (`BOLT_POOL 24`, `src/combat.js` L59), `BOLT_SPEED 42` (L57), single-hit (no pierce). Carries `userData.dmg` (stream 1, charged 6) and `userData.charged`; visual scale ×3, amber family. |
| Weak-point interaction | `WEAK_MULT` applies | The one boss.js-adjacent change: `src/combat.js` L337 passes the bolt's dmg instead of the literal 1 — `boss.js` `hitBoss(dmg, isWeak, api)` (`src/boss.js` L269-274) already takes a dmg parameter, so **boss.js itself is untouched**. Explicit GDD § per story-018's file-list condition (story-018 L116-117); assert at §8.4. |
| Charge meter | Reticle ring, post-R-c | The reticle rides the pointer (`src/combat.js` L538-545) and is combat's write; the meter fills 0→1 over `T_CHARGE` during a hold and flashes at the crossing. **Gated on R-c** (main.js is 500/500 until then, story-018 L23). Pre-R-c readability: `combatState()` exposes `charge` (0..1) and `charging` (bool) + the whine. |
| Audio | Charge whine at threshold crossing; release thump; deeper kill noise on charged hits | Synth recipes via the existing audio bag pattern (`sweep`/`beep`/`noiseBurst` are the fire path's existing voices, `src/combat.js` L284, L301, L306). |
| Cancel rules | Death: no release bolt, accumulator zeroed. Pause: accumulator zeroed (the fire path already reads the raw key set — `keys.has('KeyP')/has('Escape')` is the pause signal, same grammar as steer's key reads, `src/combat.js` L193-214; `src/input.js` L40 — zero cross-module change). Combat exit: wiped in `clearCombat`'s reset line (`src/combat.js` L600) and by the `enterCombat` reset block (L448-464 neighborhood). Release-early: nothing (stream already fired). | story-018 AC (L79-80) requires all three cancels; §8.2 pins each. |
| Interaction with pickups | SPREAD affects **stream shots only** (the charged bolt is always single — 3×6 = 18 alpha per cycle would break the parity anchor, §4.2). OVERDRIVE scales the stream interval only — **`T_CHARGE` is unchanged** under OVERDRIVE. SHIELD is orthogonal. | §3.3. |
| Charging suppresses the stream? | **Yes, from the threshold onward** — the definition of shape (a). | §3.1. |

### 3.3 Pickups (inherited spec, carried verbatim)

Inherited verbatim from `one-shot-work/HANDOFF.md` L227 (written 2026-11-03; story-018 L45-50
cites it): *"on kill, `Math.random() < 0.18` → drop one of SPREAD/OVERDRIVE/SHIELD (rotating
pickup sprite, 8 s ground life, blink last 2 s, pickup radius 1.4). Effects last 8 s: SPREAD =
3-bolt fan (±6°), OVERDRIVE = fire interval ÷ 2.2, SHIELD = +full shield + zero regen delay
for the window. HUD chips show active effect + seconds left. Timer state lives in the
combat.js player object; `clearCombat()` wipes it."*

Design parameterization of the parts the spec leaves open:

- **Drop site**: the two raider/orb kill paths in combat.js (`src/combat.js` L303-307, L319-325)
  call one `POWERUPS.onKill(pos)` hook. The boss is **exempt from drops** but effects must
  still apply during the boss fight (story-018 L107 — OVERDRIVE matters most there). Elite
  kills (story-019) roll the same 18% — no special elite rate ships; the knob exists if
  telemetry says otherwise.
- **Kind selection**: uniform 1/3 each. The inherited spec names three kinds without weights;
  uniform is the least-assumption reading and is assertable with seeded RNG (§8.3). A weighted
  table is a telemetry-era retune (§7 knob).
- **Entity**: a new `src/powerups.js` pool following `makePool`'s contract exactly
  (`src/pool.js` L7-52 — reuse-first spawn L17-19, `kill()` the single retirement path L41-46,
  `clear()` drains L47-51). `PICKUP_POOL = 6` (a 10-kill wave at 18% ≈ 1.8 drops; 6 is
  generous; steal-oldest at saturation is the pool's existing answer). Allocated once at
  `prepareCombat` (rim-ring lifecycle pattern) — restarts allocate nothing new (§8.6 discipline).
- **Drop position**: the dying enemy's position, **clamped to r3 ≤ R_HARD − 1 = 79** — orbs can
  legally be outside the sphere (orbit overshoot, accepted in `design/gdd/full-3d-flight.md`
  §5.4), and an unclamped drop at r3 ≈ 98 would be unreachable behind the hard clamp
  (`src/combat.js` L252-258).
- **Pickup check**: full-3D squared distance ship↔pickup < `PICKUP_RADIUS²` (1.4²) — the 3D
  scan grammar the 015 collision retune established (`src/combat.js` L297-298 pattern).
- **Effect timers**: `C.effects = { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 }` (seconds remaining) on
  the combat player object per the inherited spec; ticked by the combat dt (scaled — slow-mo
  slows effects like everything else). Picking the **same** kind again **refreshes** to 8 s (no
  stacking semantics to spec or test). **Different kinds run concurrently** — the inherited
  "chips" is plural (HANDOFF L227).
- **Effect rules**: SPREAD — each stream shot spawns a 3-bolt fan at ±6° (the shot's `forward`
  rotated ±6°; each fan bolt counts as a shot for telemetry/accuracy, §3.7). OVERDRIVE —
  `FIRE_INTERVAL / 2.2 ≈ 0.0568 s` (≈17.6/s). SHIELD — `C.shield = SHIELD_MAX` (50) instantly
  and the regen delay is 0 for the window (the regen block, `src/combat.js` L494-496, reads the
  delay as 0 during the window; a hit during the window still zeroes `regenT` (L350) but the
  zero delay means regen resumes immediately — the intended reading of "zero regen delay").
  Expiry restores the shipped constants with no snap.
- **HUD chips**: one chip per active effect, name + whole seconds left, change-gated DOM writes
  (the `#hud-bars` pattern, `src/combat.js` L523-535). **Post-R-c only**; the pre-R-c read is
  `combatState().effects` (§8.3).

### 3.4 Elite variants (inherited spec, carried verbatim)

Inherited verbatim from `one-shot-work/HANDOFF.md` L226: *"for `w >= 4`, each spawn has derived
elite chance (e.g. `eliteChance = (w >= 4) ? 0.22 : 0`), elite = scale ×1.35, retint emissive
to `0xffa02f`, HP ×3, speed ×1.15, score ×2. Derived from wave number — no hand-written lists
(acceptance #18)."*

Design parameterization:

- **Which kinds can be elite: raiders only — gunner and rammer. Orbs are excluded** (full
  analysis §9 Decision 2). The elite roll lives in `spawnRaider` after kind selection
  (`src/enemies.js` L89-91) — which is also exactly where the inherited spec aims ("Elite
  variants (enemies.js)", HANDOFF L226), and it means **zero drone.js changes**.
- **Stats on a gunner elite**: HP 2×3 = 6, speed ×1.15 (per-entity multiplier applied wherever
  the wave speed `E.speed` is consumed — `src/enemies.js` L171-172 gunner, L191 rammer), score
  150×2 = 300, scale ×1.35, trim/glow emissive retinted to 0xffa02f. **On a rammer elite**:
  HP 1×3 = 3, dive speed = wave speed ×1.15 (rammer's own ×1.15, L191) ×1.15 (elite) ≈ ≤ 15.9
  u/s at the wave-speed cap 12 (L23) — under the ship's `MAX_SPEED 17` (`src/combat.js` L41),
  still dodgeable.
- **Pool-reuse hygiene**: raider materials are per-instance (created inside `makeRaider`,
  `src/enemies.js` L32-33, L45), so the retint is safe — and `spawnRaider` must **reset**
  tint/scale/hp-multiplier unconditionally on every spawn, or a former elite respawns as an
  elite. This reset is an explicit AC item (§8.4).
- **The ram kill still denies score**: an elite rammer that lands its ram dies without score
  (`src/enemies.js` L196-200) — the ×2 applies only when shot down. Intended: the ram is the
  player's failure state for that enemy.
- **The chance stays derived** (0.22 for wave ≥ 4) — not a table column; no hand-written elite
  lists (acceptance #18, story-019 L31).

### 3.5 Per-wave composition tables

The deferral story-019 records (L32-33, quoting story-012 L35): "the pure formula in
enemies.js is untouched — per-wave tables are story-019". Today raider composition is fully
derived (`src/enemies.js` L1-6 header: "there is no per-wave table anywhere"; formulas L22-26)
and the boss spawns **instead of wave 6** (`BOSS_WAVE = 5`, `src/boss.js` L34; gate
`src/combat.js` L377). The natural path is therefore waves 1-5, then the boss — **the table
covers the natural path, the formulas stay the fallback beyond it**.

**Table shape (raiders only — orb counts stay `droneCountFor`)**: the table object lives in
`src/enemies.js` and author `{ gunner, rammer }` per wave 1-5. Orb counts remain the pure rule
`droneCountFor = min(3, max(0, w−2))` (`src/drone.js` L51) — the authored numbers below *are*
that formula's numbers, so tabling them would touch drone.js for zero design change
(story-012's module contract). The composition VIEW below shows both columns; the story-019
assert pins the raider split.

**Counts are pre-elite** (§9 Decision 2b): a row states the spawn plan; the elite roll is a
per-spawn modifier applied after the count is fixed (the inherited spec's own shape — "each
spawn rolls an elite chance", story-019 L31). The wave-clear condition
(`aliveCount + queuedCount`, `src/combat.js` L371-372) is count-based and unaffected either
way; pre-elite keeps the flow-check entry assert "wave 1 raider count unchanged (4)"
(`tools/flow-check.mjs` L112) reading "spawn count" identically.

**Authored composition** — totals match the derived `waveCount` exactly (the difficulty *curve*
stays as shipped and tuned; the table's job is a **deterministic kind split**, replacing the
stochastic `rammerShare` roll, `src/enemies.js` L26, L89):

| Wave | Gunners | Rammers | Raiders (total) | Orbs (`droneCountFor`) | Source | Elite chance | Design intent |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 3 | 4 | 0 | table | 0 | Teaches rammers (dodge) + one gunner demonstrates bolts. Total matches derived → the wave-1 entry assert survives verbatim. |
| 2 | 2 | 4 | 6 | 0 | table | 0 | Gunner pressure doubles; pure dodge-and-shoot wave. |
| 3 | 3 | 4 | 7 | 1 | table | 0 | The orb's scaffolded intro — exactly one (story-012's kind enters here; drones join from wave 3, `src/drone.js` L51). |
| 4 | 4 | 5 | 9 | 2 | table | 0.22 | **First elite wave** — the chance starts exactly here per the inherited spec; the authored split keeps elite rolls readable against a fixed plan. |
| 5 | 5 | 5 | 10 | 3 | table | 0.22 | The pre-boss exam: max orbs, gunner-heavy, elites live. |
| 6 | — | — | — | — | **boss** | — | `BOSS.spawnBoss` instead of wave 6 (`src/combat.js` L377; `src/boss.js` L34). |
| 7 | ~10 | ~3 | 13 | 3 | **derived fallback** | 0.22 | `waveCount(7) = min(24, 3+floor(10.5)) = 13`, split = stochastic `rammerShare(7) = 0.25` (L22-26) — the "~" marks an expected value, not an authored one. Unreachable naturally (victory fires at boss death); serves probes + any future endless mode. |
| 8 | ~11 | ~4 | 15 | 3 | derived fallback | 0.22 | `waveCount(8) = 15`, `rammerShare(8) = 0.25`. As above. |

(Tabled rows are deterministic authored numbers; fallback rows are the shipped formulas' own
outputs — the split there stays stochastic by design, which is exactly the table↔derived
boundary the assert pins.)

- **Table↔derived boundary: after wave 5.** Stated in the `src/enemies.js` header (story-019
  AC L79-80 requires it) and pinned by an assert **both ways at the boundary** — wave 5 reads
  the table, wave 6+ reads the formulas (§8.4). Because table totals equal derived totals at
  waves 1-5 *by design*, the boundary mutation-catcher is the **seeded-RNG kind split**: a
  "bypass the table, roll `rammerShare`" mutation changes wave 1 from a deterministic
  1-gunner/3-rammer to a stochastic roll and fails the seeded assert (§8.4).
- `startWave` keeps its seed-one-on-the-field behavior (`src/enemies.js` L81) — wave 1 never
  looks empty; unchanged.

### 3.6 Boss reward — 1000 flat (LOCKED)

- `SCORE_BOSS = 1000` joins the score-constants block (`src/combat.js` L62-66, beside
  `SCORE_DRONE 100 / SCORE_GUNNER 150 / SCORE_WAVE 150 / SCORE_ORB 200`) — a named const, not
  a magic number (story-019 L23-24). **The value is locked by the player; it is not a tuning
  knob** (§7 lists it as locked).
- **Award site**: inside the `bossApi.report` wrapper's `bossDefeated` branch
  (`src/combat.js` L130-141), **before** the `victoryFired`/`go('victory')` line (L139). The
  victory card reads `combatState().score` in the same frame (`src/phases.js` L102-105), so the
  card shows pre-boss score + 1000 with zero card edits (story-019 L63).
- **Exactly-once**: the award carries its own `C.bossAwarded` latch (the `victoryFired` pattern,
  `src/combat.js` L456 reset) so a forced second completion can never double-award — the same
  re-fire-safety class as `bossDefeatedReports` (L135) and the B.dead death latch
  (`src/boss.js` L242-246). Probe: §8.4.
- **Ordering hazard cleared**: on the boss-kill frame the report wrapper runs inside
  `BOSS.tickBoss` (`src/combat.js` L485) *before* `wavesTick` (L486) — and `wavesTick` yields
  to `victoryFired` (L365), so the wave-clear bonus (L373) cannot land after the card freezes
  its score. The existing keep-passing assert "victory card score equals the internal final
  score" (`tools/flow-check.mjs` L619-621) then *validates* the +1000 automatically.
- **High-score write-through**: `victory.enter` already does
  `writeHighscore(Math.max(finalScore, readHighscore()))` (`src/phases.js` L104) — the +1000
  rides it with zero store changes.

### 3.7 Balance telemetry (the stage's namesake)

A per-run accumulator of **event-driven counters** — incremented at events that already exist
in code, never sampled per-frame (story-019 risk L116-117). Lives as `C.telemetry` in
combat.js; zeroed in `enterCombat` beside score/kills (`src/combat.js` L453 pattern); exposed
via `combatState().telemetry` (one reference return; `J()` stringifies it). **Zero player UI.**

```
telemetry = {
  kills:        { gunner: 0, rammer: 0, orb: 0 },      // by kind, any bolt
  eliteKills:   { gunner: 0, rammer: 0 },              // subset of kills
  chargedKills: 0,                                     // kills by charged bolt — the skill signal
  shots:        { stream: 0, charged: 0 },             // bolts spawned (SPREAD fan: each fan bolt +1)
  hits:         { stream: 0, charged: 0 },             // bolts that hit anything (1:1 max — bolts die on hit)
  damageTaken:  { bolt: 0, ram: 0, dive: 0, bossDash: 0 },  // by source, summed damage
  deathBy:      null,                                  // source of the killing blow
  scoreBy:      { gunner: 0, rammer: 0, orb: 0, waveBonus: 0, boss: 0 },
  waveReached:  1,
  waveTimes:    [],                                    // combat-clock time at each wave increment (≤ 6 events/run)
  pickups:      { dropped: 0, picked: 0, expired: 0, byKind: { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 } },
}
```

- **Source attribution at the granularity the code honestly provides**: `bolt` = gunner fire
  AND boss volley (the volley rides the same enemy-bolt pool and player-scan —
  `src/boss.js` L24-28, `src/enemies.js` L218-229 — same 12 dmg, same dodge rule; distinguishing
  them buys nothing for tuning). `ram` = raider contact (25, `src/enemies.js` L197). `dive` =
  orb dive contact (25, `src/drone.js` L209-210). `bossDash` = the dash ram (25,
  `src/boss.js` L203-206). Mechanism: `damagePlayer(n)` gains an optional source tag
  (`src/combat.js` L344) — the call sites are exactly four.
- **Accuracy is derived, not stored**: `hits.stream / shots.stream` — computed by the reader,
  so the accumulator never divides.
- **`waveTimes` is the single most retune-relevant field**: wave increments are events
  (`src/combat.js` L376), so per-wave pacing is recorded for free.
- **Pickup fields read story-018's surfaces** (`POWERUPS.onKill`/pickup/expiry counters) —
  story-018's declared unlock (story-018 L130-131). If 019 merges first, the fields report 0
  (soft dependency, §6).
- **Purpose discipline**: telemetry is a tuning surface for wave-table and knob retunes
  (story-019 L43-44) — read via the harness and retune sessions
  (`production/qa/evidence/`), never rendered to the player.

### 3.8 Closed surfaces — what Stage 4 forces, item by item

| Closed surface | Verdict | Forced interaction |
|---|---|---|
| Existing fire asserts (short taps, scriptedKill) | Keep | scriptedKill's bolt is probe-spawned, not fire-path (`src/combat.js` L397-402) — survives untouched. All sub-threshold hold behavior is bit-identical (§3.1). |
| Boss probe bolt-stream (`tools/flow-check.mjs` L486-489) | Keep | The drive fires sub-threshold taps (probe-owned precondition, pinned in §8.1) → stream bolts, dmg 1, ratio 3 unchanged. |
| `combatState()` contract (`src/combat.js` L606-623) | Extend | Gains `charge`, `charging`, `effects`, `telemetry`. No existing field changes meaning. |
| Restart baseline (§8.6 / restartProbe, `src/phases.js` L152-155) | Grow, recorded | Pickup pool adds ~6 entities to the warm baseline; charged bolts are pool-internal (no new meshes). Expected, recorded — same-build comparison, story-017 precedent (story-018 L125-127). |
| `BOLT_POOL` 24 (`src/combat.js` L59) | **Raise to 36** (recommended rider) | SPREAD+OVERDRIVE saturation math: 17.6 shots/s × 3 fan bolts × 1.2 s life ≈ 63 live-bolt demand at the pathological extreme (§5). 36 is a prepare-time allocation — restart-clean preserved — and steal-oldest (L19) remains the final cap. One const; flagged for the orchestrator, not silent. |
| Launch phases (`src/launch.js`) | Zero-diff | Untouched by both stories (story-018 L71, story-019 L66). |
| Waves beyond the boss gate | Unreachable, kept | Victory fires at boss death (story-014); the derived fallback exists for probes and future modes (§3.5). |
| Boss behavior | Zero change | `hitBoss` already takes a dmg param (`src/boss.js` L269-274); boss.js's only 019 touch is the award call site in combat.js's wrapper (story-019 L52-53). One stale comment noted, §5. |

## 4. Formulas

### 4.1 Stream and charged cadence

```
stream:  interval I = 1/8 s (src/combat.js L56)           → DPS = 1/0.125 = 8 dmg/s
charged: cycle ≈ T_CHARGE + press overhead (~0.15-0.25 s human)
         = 0.6 + ~0.2 ≈ 0.8 s per bolt                     → DPS ≈ 6/0.8 ≈ 7.5 dmg/s
hold profile: bolts during a hold of duration H =
         H < T_CHARGE : floor(H/I) + 1 stream bolts (press-frame first bolt), 0 charged
         H ≥ T_CHARGE : floor((T_CHARGE)/I) + 1 ≈ 5 stream bolts (all before the threshold),
                        then 1 charged bolt on release
```

**DPS parity anchor (the design's load-bearing number)**: charged DPS stays within ±15% of
stream DPS at the shipped knobs. The charge is **not** a DPS upgrade — it converts spray-DPS
into *alpha* (6 dmg front-loaded in one aimed hit). Higher and the stream dies (dominant);
lower and the charge dies; parity + burst = situational choice (flow/competence: the aimed
shot is the skill, the burst is its payoff).

### 4.2 TTK table (all-hits ideal, per kind)

| Target | HP | Stream hits (1 dmg) | Stream TTK @8/s | Charged hits (6 dmg) |
|---|---|---|---|---|
| Rammer | 1 (`src/enemies.js` L91) | 1 | instant | 1 (overkill) |
| Gunner | 2 (L91) | 2 | 0.25 s | 1 |
| Orb | 2 (`src/drone.js` L24) | 2 | 0.25 s | 1 |
| Elite rammer | 3 | 3 | 0.375 s | 1 |
| Elite gunner | 6 | 6 | 0.75 s | **1 — the one-shot anchor for CHARGE_DAMAGE 6** |
| Boss body | 60 (`src/boss.js` L35) | 60 | 7.5 s of perfect contact | 10 |
| Boss weak point | 60, ×3 (`WEAK_MULT`, L51) | 20 | — | **4** (6×3 = 18/hit) |

**Stale-comment finding**: `src/boss.js` L35 reads `// ≈ 20 body hits / 7 weak-point hits at
1-dmg bolts` — that arithmetic matches BOSS_HP = 20 (20 body / 20÷3≈7 weak), not the shipped
60. The constant was evidently retuned after the comment was written. The math above uses the
constant; recommend a comment-only correction rides story-019 (decision for the orchestrator —
story-019's boss.js scope is "award call site only", story-019 L52-53).

### 4.3 Pickup economy

```
drop rate p = 0.18; expected drops per wave ≈ waveCount × p
w1: 4×0.18 ≈ 0.7    w3: 7×0.18 ≈ 1.3    w5: 10×0.18 = 1.8
a full natural run ≈ Σ(4+6+7+9+10) × 0.18 ≈ 6.5 drops / run
kind split: uniform 1/3 (§3.3); elite kills roll the same p
```

### 4.4 Elite modifiers (composed)

```
elite roll: E.wave ≥ 4 && Math.random() < 0.22   (per spawn, raiders only)
elite gunner: HP 2×3=6 · speed E.speed×1.15 · score 300 · scale ×1.35 · emissive 0xffa02f
elite rammer: HP 1×3=3 · dive (E.speed×1.15)×1.15 ≤ 15.9 u/s (E.speed cap 12, enemies.js L23)
wave-4 expected elites: 9 spawns × 0.22 ≈ 2.0;   wave-5: 10 × 0.22 ≈ 2.2
```

### 4.5 Score ledger (natural run, shot-down kills excluded)

```
wave bonuses: 150×(1+2+3+4+5) = 2400 (SCORE_WAVE × w, src/combat.js L373)
boss: +1000 (SCORE_BOSS, §3.6)  → guaranteed floor ≈ 3400 + kill score
```

## 5. Edge Cases

- **Death mid-hold**: `damagePlayer` flips `C.dead` (`src/combat.js` L355); fireTick's guard
  (L277) already blocks firing while dead — the accumulator zeroes and the release fires
  nothing. The death slow-mo does not change this (the guard is not dt-dependent).
- **Pause mid-hold**: P/Escape are the pause keys in combat (`src/input.js` L40); the fire path
  reads the same raw key set the steer path reads (§3.2 cancel rules) — the accumulator zeroes
  on pause. Post-unpause release therefore fires a tap's worth of stream, never a charged bolt.
  Pinned by assert (§8.2).
- **Combat exit mid-hold** (death-card SKIP while LMB is down): `clearCombat`'s reset line
  (`src/combat.js` L600) wipes the accumulator; the per-entry reset (L452 neighborhood) covers
  re-entry. `input.fire` self-corrects — `onPointerUp` is a window-level listener regardless of
  phase (`src/input.js` L64-66).
- **Alt-tab mid-hold**: `blur` clears mouseActive but not `fire` (`src/input.js` L67-70) — a
  pre-existing input-state class the shipped stream already has. Under the charge model this
  gets *safer* (a full charge waits for a release instead of spraying indefinitely). Accepted;
  noted as a shared input-state finding for the future polish list, not a 018 fix.
- **SPREAD + OVERDRIVE simultaneously**: ≈17.6 shots/s × 3 fan bolts vs `BOLT_POOL` — the
  saturation math and the recommended pool raise are §3.8/§5's honest note; steal-oldest
  (`src/pool.js` L19) remains the final cap (a stolen slot = a vanished long-range bolt at the
  pathological extreme — accepted, visible only when both effects run and nothing is hitting).
- **Orb dies outside the sphere**: drop position clamped to r3 ≤ 79 (§3.3) — an unclamped drop
  behind the hard clamp would be permanently unreachable.
- **Former elite respawns as normal**: the spawn-site reset (§3.4) makes the bad state
  unrepresentable; assert-pinned (§8.4).
- **Charged bolt vs the orb's generous radius**: `ORB_BOLT_R2 = 1.69` (`src/drone.js` L26) —
  the charged bolt hits identically (dmg 6 one-shots the 2-HP orb); no special case.
- **Charged bolt at pool saturation**: the charged bolt is a `spawn()` like any other — at the
  steal-oldest extreme it could steal a stream slot. ≤ 1 charged bolt is ever live (release-
  gated), so this is vanishingly rare; accepted.
- **Pickup during death slow-mo**: timers tick on scaled dt (consistent with every combat
  timer); the pickup radius check runs against the dead-but-drifting ship — harmless, allowed.
- **Boss-kill frame ordering**: report wrapper (L485 tick order) precedes `wavesTick` (L486)
  and `wavesTick` yields to `victoryFired` (L365) — no post-freeze bonus hazard (§3.6).
- **`waveTimes` under probes**: probes that force waves (bossProbe skips the wave-5 wait,
  `tools/flow-check.mjs` L486) produce shorter `waveTimes` arrays — telemetry records what
  happened, probes assert their own drives; no special case.

## 6. Dependencies

**Direction of data flow**: input (`src/input.js`, read-only) → `fireTick`/`steer()`
(`src/combat.js`) → bolts → kill sites → `POWERUPS.onKill` (018) + telemetry increments (019)
→ `combatState()` → harness.

**Story-018 (charged shot + pickups)** touches:
- `src/combat.js` — fire path rework (§3.1-3.2), bolt `userData.dmg`/`charged`, kill→drop hook +
  effect application, `combatState()` gains charge/effect fields, `BOLT_POOL` 24→36 (rider,
  §3.8), cancel/reset lines in `enterCombat` (L452 neighborhood) + `clearCombat` (L600).
- `src/powerups.js` (NEW) — drop roll, pickup pool (makePool contract, `src/pool.js` L7-52),
  effect timers, reporting; dep-check stays acyclic (nothing imports main.js).
- `src/audio.js` — charge whine, release thump, pickup/expire blips (synth recipes).
- HUD (charge meter + chips) — `src/main.js` / `tools/index.template.html`, **post-R-c only**
  (main.js 500/500 until the refactor lands first in Stage 4, story-018 L23).
- `src/probes.js` — `?chargeProbe=1` / `?powerupProbe=1` flags, state, reset hygiene
  (`resetProbes` report deletes, `src/probes.js` L34-44 pattern), ticks called from
  `tickCombat` (the `droneProbeTick…dressingProbeTick` call row, `src/combat.js` L488-491).
  Review-fix round 2026-11-06: the two story-018 walks live in `src/probes-charge.js` /
  `src/probes-powerup.js` (one walk per file; shared helpers in `src/probes-common.js`) —
  probes.js re-exports the ticks, so the combat.js wiring is unchanged.
- `tools/flow-check.mjs` — new asserts (§8.2-8.3).

**Story-019 (elites + tables + telemetry + boss reward)** touches:
- `src/combat.js` — `SCORE_BOSS` const + the award in the bossDefeated wrapper (§3.6);
  `C.telemetry` zeroed in `enterCombat` (L453 pattern); `damagePlayer` source tag (§3.7).
- `src/enemies.js` — elite roll + reset in `spawnRaider` (L84-100), the composition table +
  header boundary note (§3.5), per-entity elite speed multiplier.
- `src/boss.js` — award call site only (story-019 L52-53); optional stale-comment fix (§4.2).
- `src/probes.js`, `tools/flow-check.mjs` — elite/table/telemetry asserts (§8.4).

**Provides / requires**: 018 provides the pickup counters + effect surfaces; 019's telemetry
reads them (soft dep — fields read 0 if 019 lands first). 019's boss-reward, elites and tables
are independent of 018 and may land in either order. Both stories require R-c before any HUD
line. Neither touches `src/launch.js` (zero-diff, verified by the diff review both stories
already promise).

## 7. Tuning Knobs

Project convention: named constants in the owning module's header (`design/gdd/full-3d-flight.md`
§7; `src/drone.js` L22 "tuning knobs live here"). LOCKED values are marked — they are player
decisions, not balance surfaces.

| Knob | Initial | Range | Category | Lives in | Rationale |
|---|---|---|---|---|---|
| `T_CHARGE` | 0.6 s | 0.45-0.9 | feel | src/weapons.js (review-fix split from combat.js) | Tap zone below, one gunner-pass above; the whine teaches the crossing (§3.2). |
| `CHARGE_DAMAGE` | 6 | 4-8 | curve | src/weapons.js (review-fix split from combat.js) | Elite-gunner one-shot (6 = 6); weak-point 18 → 4 boss hits; DPS parity anchor ±15% (§4.1). |
| charged bolt scale | 3.0 | 2-4 | feel | src/weapons.js (review-fix split from combat.js) | Readable under the shipped bloom chain; amber family (§3.2). |
| `SUPPRESS_STREAM` | true (design const) | not tunable | design | src/weapons.js (review-fix split from combat.js) | The balance hinge (§3.1) — flipping it creates a dominant strategy; documented, not a knob. |
| `BOLT_POOL` | 36 (raised from 24) | 24-48 | curve | src/combat.js | SPREAD+OVERDRIVE headroom (§3.8); prepare-time allocation, restart-clean preserved. |
| `DROP_CHANCE` (GDD name: PICKUP_DROP_P) | 0.18 | 0.10-0.30 | curve | src/powerups.js | Inherited (HANDOFF L227); retune WITH telemetry (story-018 L70). |
| pickup kind weights | uniform 1/3 | 0.2-0.5 each | curve | src/powerups.js | Least-assumption reading (§3.3); telemetry says if the dial should move. |
| `PICKUP_POOL` | 6 | 4-10 | gate | src/powerups.js | ~1.8 drops/wave expected (§4.3); steal-oldest caps the rest. |
| `PICKUP_LIFE` / blink | 8 s / 2 s | 5-12 / 1-3 | feel | src/powerups.js | Inherited (HANDOFF L227). |
| `PICKUP_RADIUS` | 1.4 | 1.0-2.0 | feel | src/powerups.js | Inherited; full-3D check (§3.3). |
| `EFFECT_T` (GDD name: EFFECT_DURATION) | 8 s | 5-12 | feel | src/powerups.js | Inherited; refresh-not-stack on re-pickup (§3.3). |
| `SPREAD_ARC` (GDD name: SPREAD_ANGLE) | 6° | 4-10 | feel | src/weapons.js (review-fix split from combat.js) | Inherited; stream-only (§3.2). |
| `OVERDRIVE_DIV` | 2.2 | 1.8-3.0 | curve | src/weapons.js (review-fix split from combat.js) | Inherited; stream interval only — `T_CHARGE` unchanged (§3.2). |
| `ELITE_CHANCE` | 0.22 | 0.10-0.35 | curve | src/enemies.js | Inherited (HANDOFF L226); derived from wave, never a list (acceptance #18). |
| `ELITE_MIN_WAVE` (GDD name: ELITE_WAVE_MIN) | 4 | 3-5 | gate | src/enemies.js | Inherited; kind intros land at waves 1/3 before elites (§3.5). |
| `ELITE_HP_MULT / SPEED / SCALE / SCORE / TINT` | 3 / 1.15 / 1.35 / 2 / 0xffa02f | ±30% each | curve | src/enemies.js | Inherited; composed in §4.4. |
| `TABLE_MAX_WAVE` | 5 | 4-6 | gate | src/enemies.js | The boss gate is wave 6 (`src/combat.js` L377) — the table covers the natural path (§3.5). |
| `SCORE_BOSS` | **1000 — LOCKED** | not tunable | gate | src/combat.js | Player decision 2026-11-04/05 (story-019 L12-13); named const beside L62-66. |

## 8. Acceptance Criteria

Machine-checkable criteria are phrased for the `tools/flow-check.mjs` grammar —
`ok(name, cond, extra)` with `J()`/`poll()` on `window.__stage2` (`tools/flow-check.mjs`
L28-32, L76-85), per-page `CONSOLE []` asserts (L418, L462, L680, L843, L969, L1095 pattern),
guarded probe polls with deadlines and red-by-absence (the droneProbe pattern, L421-432).

**Red-first plan**: `?chargeProbe=1` / `?powerupProbe=1` / the elite-table probe report
nothing on the prior build → every new assert records its red from the null probe (exact
droneProbe precedent, `tools/flow-check.mjs` L399-403, L692-697). **The boss-award red is the
decision's proof**: on the current build the victory probe reads SCORE without the +1000
(`src/combat.js` L329 states the silence) — recorded as story-019's red artifact before any
change lands (story-019 L89-91). Every mutation is verified applied by reading its red output;
adjacent keep-passing cases ship with each mutation (story-018 L96-100, story-019 L87-97).

### 8.1 Keep-passing sets (must stay green)

- [ ] scriptedKill unchanged: probe-spawned bolt path untouched (`src/combat.js` L397-402);
      kills 1, rammer score 100 (mutation record L383-386 values).
- [ ] Wave-1 entry snapshot: 4 raiders, 0 drones, boss null (`tools/flow-check.mjs` L111-113) —
      the table's wave-1 total is authored to match.
- [ ] bossProbe: phases in order, weak ratio 3, dash/overshoot/slow-mo all green (L486-511,
      L536-542) — the drive's taps stay sub-threshold (pinned precondition, §8.2).
- [ ] Victory set: reports=1 (L613-614), card-score == internal (L619-621 — now also proves
      the +1000), clock frozen, REPLAY sweep, second-run baseline clean (L672-673).
- [ ] All story-015/016/017 flight/boundary/dressing asserts untouched (zero steer/steer-
      adjacent changes in this stage).
- [ ] Full flow-check green (114 existing + new, per story-018 L86 / story-019 L84-85 counts),
      `CONSOLE []` per page; restartProbe clean with the recorded baseline growth (§3.8);
      dep-check acyclic; main.js ≤ 500 (R-c honored); boot-marks inside the documented band.

### 8.2 `?chargeProbe=1` (story-018)

- [ ] Reports `window.__stage2.chargeProbe` (red by absence on the prior build);
      `combatState()` exposes `charge` (0..1) and `charging` (bool).
- [ ] Tap 0.2 s → ≥ 1 stream bolt, 0 charged bolts. Hold 1.0 s → exactly 1 charged bolt on
      release and ≤ 6 stream bolts, all fired before the threshold mark (the §4.1 hold profile).
- [ ] Charged bolt kills a seeded gunner (HP 2) in one hit AND a seeded elite gunner (HP 6) in
      one hit (dmg 6 verified through the real kill path).
- [ ] Charged weak-point hit on the boss does 18 (6 × `WEAK_MULT` 3) — the one boss-adjacent
      assert, per the GDD §3.2 gate (story-018 L116-117).
- [ ] Cancels: death mid-hold → `charge == 0` and release fires nothing; P-hold mid-hold →
      post-unpause release fires ≤ 1 stream bolt, 0 charged; combat exit → accumulator wiped
      (re-entry reads 0; restartProbe parity).
- [ ] Charged bolt count over a 3-shot burst = 3 (one per completed hold — never 0, never >1
      per release).

### 8.3 `?powerupProbe=1` (story-018)

- [ ] Reports `window.__stage2.powerupProbe` (red by absence).
- [ ] Seeded drop rate: N = 100 forced kills → drops within the binomial 95% band for
      p = 0.18 (seeded; widen trials, never bounds — story-018 L102-104). With drops forced,
      kinds land ≈ 1/3 each within band.
- [ ] At most one pickup per kill (no double-spawn over N kills).
- [ ] Despawn: forced drop visible at 7.9 s, gone at 8.1 s; blink state active in the last 2 s.
- [ ] Pickup radius: ship at 1.3 picks up, at 1.6 does not (full-3D check).
- [ ] SPREAD: one stream shot spawns 3 bolts with ±6° spread (bolt count + dir vectors);
      the charged bolt stays single under SPREAD. OVERDRIVE: measured interval ≈ 0.0568 s
      over a burst (0.125/2.2 ±10%). SHIELD: shield reads 50 after pickup; post-hit regen
      resumes immediately (delay zeroed) within the window and the 3 s delay is restored after
      expiry.
- [ ] Same-kind re-pickup refreshes the timer to 8 s (not stack); two kinds run concurrently.
- [ ] `clearCombat()` wipes timers + entities: re-entry shows zero chips/effects and
      restartProbe stays `clean:true` with the recorded entity baseline growth (§3.8).
- [ ] HUD chips (post-R-c): name + seconds visible while active, gone after expiry.

### 8.4 Story-019 probe (elites / tables / telemetry / boss reward)

- [ ] Boss reward: victory probe final score = (pre-boss score) + 1000 exactly;
      `bossDefeatedReports == 1`; a forced second completion never double-awards
      (`C.bossAwarded` latch); re-entry after victory starts at score 0 (second-run assert
      extension, `tools/flow-check.mjs` L672-673 shape).
- [ ] High-score: the +1000 writes through `writeHighscore` (`src/phases.js` L104) —
      persist, reload, read back.
- [ ] Elites: seeded probe at wave ≥ 4 → elite rate within the binomial 95% band for
      p = 0.22 over N = 50 spawns; wave 3 → 0 elites; each stat asserted via probe fields
      (HP 6/3, speed ×1.15, score ×2 → elite gunner kill reads 300, tint 0xffa02f,
      scale ×1.35); a former elite's respawn reads normal (reset pin, §3.4).
- [ ] Tables: waves 1-5 assert the authored split exactly (seeded RNG — wave 1 = 1 gunner /
      3 rammers, etc.); wave 5 reads the table AND wave 6 reads the derived fallback
      (asserted both ways at the boundary); `src/enemies.js` header states the boundary.
- [ ] Telemetry: one scripted probe run reports every field with sane values (kills-by-kind
      matches the probe's own kills; hits ≤ shots; no NaN/undefined); the accumulator is
      zeroed on `enterCombat` (mutation "forget to zero" → RED via restartProbe parity).

### 8.5 Experiential criteria (playtest, stage close — joins the owed look/feel list)

- Charged shot executes from the hint (hint comprehension): after reading the hint bar's
  charge line, the player executes at least one full charge-release within their first two
  waves (the whine confirming the hold — §3.1).
  *Re-worded 2026-11-07 per the stage-4 checkpoint ruling — the shipped hint bar pre-empts
  unprompted discovery by design; what the playtest measures is whether the hint translates
  into the behavior, and whether suppression reads as charging (item 2) and chips stay
  legible (item 3).*
- The stream never feels downgraded: no "my gun stopped working" reports at the threshold —
  the suppression must read as *charging*, not jamming.
- A pickup is legible: what it does, how long is left (chip + effect identity).
- Elites read at a glance as *same shape, hotter* — the amber is identified as dangerous
  before the first elite kill.
- Telemetry shows nothing on screen (its absence is itself an AC — it is not player UI).

## 9. Decisions for the Player

Each decision: options + a labeled recommendation. The GDD's numbers assume the
recommendations; a different pick re-derives only the named sections.

**Decision 1 — The fire-binding model (the load-bearing one).** Hold-to-fire (~8/s since S4,
`src/combat.js` L56) and hold-to-charge compete for LMB (the only fire input — Space is boost,
`src/input.js` L39).
1. **Threshold spray-then-charge (Recommended)** — stream below `T_CHARGE` 0.6 s; at the
   threshold the stream suppresses and the charge fills; release fires one 6-dmg bolt. *Key
   trade-off*: the player sacrifices stream DPS for one heavy bolt — a real choice, no dominant
   strategy. Consequences: all short-tap asserts survive verbatim; only long-hold bolt counts
   re-derive (bounded by the §4.1 hold profile); scriptedKill untouched (probe-spawned bolt).
   Serves both pillars — no new input, default behavior unchanged.
2. **Separate key (RMB)** — zero assert churn, explicit choice. Consequences: RMB is
   context-menu land in a browser (needs preventDefault + touchpad friction); a dexterity tax
   rather than a decision; needs an input.js listener change story-018 prefers to avoid; the
   "obvious controls" pillar bills a second fire input for a showcase audience.
3. **Charge replaces the stream entirely** — cleanest mental model, and the biggest regression:
   deletes the shipped feel, strictly worse opening damage (charge time before first hit),
   rewrites every fire-path assert. Rejected on both pillar and harness grounds.

**Decision 2 — Which kinds can be elite (+ pre/post-elite counts).**
1. **Raiders only, counts pre-elite (Recommended)** — gunner + rammer roll elites in
   `spawnRaider` (`src/enemies.js` L89-91); orbs excluded; a table row states the spawn plan,
   the elite roll is a per-spawn modifier after it. Consequences: zero drone.js changes; the
   wave-1 count assert reads identically; orbs keep their cyan showcase identity.
2. **Raiders + orbs** — the orb becomes a 6-HP dive threat with the same 25-dmg binary dive:
   a difficulty spike with no new counterplay, and the amber retint fights the orb's cyan
   identity in its onboarding waves (3-4). Rejected.
3. **Gunners only** — safest, but elite rammers are the better *threat* (3 HP forces shooting
   mid-dive); pure-sponge elites are less interesting than a faster lethal variant. Rejected.
   *Counts sub-decision*: pre-elite (Recommended) vs post-elite ("2 gunners" guarantees 2
   elite gunners) — post-elite hard-codes luck out of the design and contradicts the inherited
   per-spawn roll (story-019 L31).

**Decision 3 — Wave-table shape.**
1. **Waves 1-5 tabled (authored kind split, totals = derived), derived fallback beyond,
   boss at the wave-6 gate (Recommended)** — the table's job is the deterministic split, not a
   new difficulty curve; totals matching derived keeps the shipped pacing and the wave-1 entry
   assert green. Consequences: the boundary assert needs the seeded split to discriminate a
   table-bypass mutation (§3.5); wave 6+ stays formula-pure for probes/future modes.
2. **Waves 1-8 tabled incl. post-boss rows** — rows 6-8 are dead in natural play (victory
   fires); authoring them invites drift between table and formulas with no player to feel it.
   Rejected.
3. **No table (stay derived)** — contradicts the locked story-019 scope (the deferral
   story-012 recorded). Not an option; listed for completeness.

**Decision 4 — Telemetry field list.**
1. **The 12-group event-driven set (Recommended, §3.7)** — kills by kind (+elite/charged
   splits), shots/hits, damage by the four honest sources, deathBy, score by source,
   waveReached + waveTimes, pickup counters. Consequences: every later wave-table retune reads
   one dump; allocation only at events; `waveTimes` gives the pacing curve for free.
2. **Minimal (kills/accuracy/wave only)** — cheaper, but blind to damage-source and pacing —
   the two questions a retune actually asks ("what is killing players", "where does pacing
   bend"). Rejected.
3. **Extended (per-wave TTK arrays + positional heatmaps)** — heatmaps need per-frame
   positional sampling, violating the event-driven constraint (story-019 risk L116-117).
   Rejected for Stage 4; revisit only with evidence that the 12 groups cannot answer a real
   retune question.

**Riders needing an orchestrator call** (small, flagged, not silent): `BOLT_POOL` 24→36 (§3.8);
the boss.js stale-comment fix (§4.2); the alt-tab hold-fire input-state finding logged for the
future polish list (§5).
