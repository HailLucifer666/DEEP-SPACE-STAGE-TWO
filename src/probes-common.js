// STAGE TWO — probe-drive SHARED helpers (review-fix split, story-018 review round: one walk
// per file — src/probes-charge.js / src/probes-powerup.js — with the helpers used by MORE THAN
// ONE probe module living here). Own file, not a probes.js core, for the cycle reason: probes.js
// re-exports the moved ticks, so a probes.js home would make probes-charge.js import probes.js
// while probes.js imports probes-charge.js — an import cycle (house dep-check rule 1). Same
// discipline as the drives themselves (R-e): probes never import combat.js; ticks receive combat
// state as arguments. VERBATIM move from src/probes.js (89-101) — no statement touched.
import * as ENEMIES from './enemies.js';
import * as DRONES from './drone.js';

/* ---------- story-018 shared drive helpers ----------
 * Probe-owned preconditions (pitchProbe/bossProbe precedent): empty field, wave pinned at 1
 * with a 99 s gap (wavesTick's 1.6 s cycle can never fire — the drive re-pins AFTER wavesTick
 * each frame, probes run last in tickCombat), ship healed + parked. `pin` is the per-tick
 * form; `clear` is the stage-entry form. */
export function cpFieldClear(C) {
  ENEMIES.clearEnemies();
  DRONES.clearDrones();
}
export function cpPin(C, heal) {
  C.wave = 1; C.waveGapT = 99;
  if (heal) { if (C.hp < 100) C.hp = 100; if (C.shield < 50) C.shield = 50; }
}
