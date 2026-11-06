// story-019 mutation runner (2026-11-06). Protocol per story (story-018 precedent): for each
// mutation — apply the precise source edit, npm run build, run the FULL flow-check, save the
// raw output, restore the file with git checkout, and rebuild at the end. Every red is
// VERIFIED APPLIED by reading its output (a silent no-op proves nothing); adjacent
// keep-passing cases are read from the same outputs. The mutations and the asserts they
// discriminate are annotated in tools/flow-check.mjs next to each assert.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const EV = 'production/qa/evidence/story-019-elites-waves-telemetry';

const MUTATIONS = [
  {
    name: 'elite-chance-0',
    file: 'src/enemies.js',
    from: 'export const ELITE_CHANCE = 0.22;',
    to: 'export const ELITE_CHANCE = 0; // MUTATION 2026-11-06: the elite chance is zeroed — the rate-band assert must go RED',
    expectFail: 'elite rate within the exact binomial 95% band',
    keepPassing: ['wave 3 produces zero elites', 'elite gunner stats', 'elite kill pays ×2', 'wave 1 composition'],
  },
  {
    name: 'elite-reset-removed',
    file: 'src/enemies.js',
    from: [
      '  // story-019: UNCONDITIONAL per-spawn reset BEFORE any elite stamping — the pool reuses',
      '  // instances, so a former elite\'s stale scale/tint/flag/speed/r must never leak into a',
      '  // normal spawn. The bad state is made unrepresentable here, not patched at the use sites.',
      '  const u = d.userData;',
      '  u.elite = false;',
      '  u.speedMult = 1;',
      '  d.scale.setScalar(1);',
      '  u.r = R_RAIDER;',
      '  u.trim.emissive.setHex(TRIM_TINT);',
      '  u.glow.color.setHex(GLOW_TINT);',
    ].join('\n'),
    to: '  // MUTATION 2026-11-06: the unconditional per-spawn reset REMOVED — a former elite\'s skin leaks into the reused pool slot.',
    expectFail: 'former elite respawns normal',
    keepPassing: ['elite gunner stats', 'elite rammer stats', 'elite rate within the exact binomial 95% band'],
  },
  {
    name: 'table-bypass',
    file: 'src/enemies.js',
    from: [
      '  const row = w <= TABLE_MAX_WAVE ? WAVE_TABLE[w] : undefined; // story-019: waves 1-5 read the table, 6+ the derived fallback (the boundary — see the header)',
      '  E.waveTable = row ? { gunner: row.gunner, rammer: row.rammer } : null; // a COPY — the live kind budget spawnRaider drains; the authored row stays pristine',
    ].join('\n'),
    to: '  E.waveTable = null; // MUTATION 2026-11-06: the table is BYPASSED — every wave rolls the stochastic rammerShare split.',
    expectFail: 'wave 1 composition is the authored table split',
    keepPassing: ['table totals equal the derived waveCount', 'table↔derived boundary BOTH ways'],
  },
  {
    name: 'boss-latch-removed',
    file: 'src/combat.js',
    from: 'if (!C.bossAwarded) { C.bossAwarded = true; C.score += SCORE_BOSS; }',
    to: '{ C.bossAwarded = true; C.score += SCORE_BOSS; } // MUTATION 2026-11-06: the exactly-once latch REMOVED — every completion re-awards.',
    expectFail: 'boss reward: final score = pre-boss + 1000 exactly',
    keepPassing: ['story-019: victory final score = pre-boss score + 1000 exactly', 'story-014: victory phase lands exactly once'],
  },
  {
    name: 'telemetry-zero-removed',
    file: 'src/combat.js',
    from: '  C.telemetry = freshTelemetry(); // story-019: the accumulator restarts beside score/kills (the L453 pattern) — the mutation "forget to zero" is pinned by the restart-parity assert',
    to: '  // MUTATION 2026-11-06: the telemetry zero line REMOVED — the accumulator rides across combat entries (restart parity must go RED).',
    expectFail: 'telemetry zeroed on enterCombat',
    keepPassing: ['telemetry dump is complete and sane', 'boss reward: final score = pre-boss + 1000 exactly'],
  },
];

for (const m of MUTATIONS) {
  console.log(`\n===== MUTATION ${m.name} =====`);
  let t = fs.readFileSync(m.file, 'utf8');
  if (!t.includes(m.from)) { console.error(`ANCHOR MISSING for ${m.name} — aborting this mutation`); continue; }
  if (t.includes(m.to)) { console.error(`MUTATION ${m.name} looks already applied — aborting`); continue; }
  fs.writeFileSync(m.file, t.replace(m.from, m.to));
  console.log(`applied ${m.name}`);
  try {
    execSync('npm run build', { stdio: 'inherit' });
    const out = execSync('node tools/flow-check.mjs', { encoding: 'utf8', timeout: 40 * 60 * 1000 });
    fs.writeFileSync(`${EV}/flow-mutation-${m.name}.txt`, out + '\nEXIT=0 (script ignored the suite exit)\n');
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || `\n[runner] exit ${e.status}`);
    fs.writeFileSync(`${EV}/flow-mutation-${m.name}.txt`, out + `\nEXIT=${e.status}\n`);
  }
  const saved = fs.readFileSync(`${EV}/flow-mutation-${m.name}.txt`, 'utf8');
  const applied = saved.includes('FAIL  ' + m.expectFail);
  const summary = (saved.match(/FLOW-CHECK (PASS|FAIL) — .*/) || ['(no summary)'])[0];
  console.log(`verified-applied(${m.expectFail}): ${applied ? 'RED RECORDED' : '*** NOT RED — RE-RUN NEEDED ***'}`);
  console.log(summary);
  for (const kp of m.keepPassing) {
    const green = saved.includes('PASS  ' + kp);
    console.log(`  keep-passing "${kp}": ${green ? 'green' : '*** NOT GREEN ***'}`);
  }
  // restore + hygiene
  execSync(`git checkout -- ${m.file}`);
  try { execSync('taskkill /F /IM msedge.exe', { stdio: 'ignore' }); } catch {}
  console.log(`restored ${m.file}`);
}
execSync('npm run build', { stdio: 'inherit' }); // the good bundle back on disk
console.log('\nALL MUTATIONS DONE — final build restored');
