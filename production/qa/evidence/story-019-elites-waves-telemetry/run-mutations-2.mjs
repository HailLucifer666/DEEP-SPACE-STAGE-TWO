// story-019 mutation runner #2 (2026-11-07): the two multi-line-anchor mutations the first
// runner skipped. Root cause (recorded in report.md §5): after runner #1's `git checkout`
// restore, the working file came back CRLF, so \n-joined anchors no longer matched. This
// runner detects the file's own EOL and builds the anchors with it.
//
// FINAL FORM (this file documents the exact mutations whose outputs live beside it): the
// elite-reset mutation is the SKIN-ONLY cut — the block's speedMult initialization STAYS in
// the mutated code. History: two earlier cuts (the whole block, then a cut that dropped the
// block's `const u` while still reading `u`) broke the game so hard the flow page's
// natural-death poll never fired (NaN-ghost raiders, then a ReferenceError) — see report.md
// §4 item 2 and §5 item 7. The skin-only cut's red was verified on a focused harness
// (boot → ?balanceProbe=1 only; scratch file, splice recipe in the report): GREEN 35/0 on
// the good build, then 29/5 with the target assert red (flow-focus-green.txt /
// flow-mutation-elite-reset-removed.txt).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const EV = 'production/qa/evidence/story-019-elites-waves-telemetry';

const FROM_RESET = [
  '  // story-019: UNCONDITIONAL per-spawn reset BEFORE any elite stamping — the pool reuses',
  "  // instances, so a former elite's stale scale/tint/flag/speed/r must never leak into a",
  '  // normal spawn. The bad state is made unrepresentable here, not patched at the use sites.',
  '  const u = d.userData;',
  '  u.elite = false;',
  '  u.speedMult = 1;',
  '  d.scale.setScalar(1);',
  '  u.r = R_RAIDER;',
  '  u.trim.emissive.setHex(TRIM_TINT);',
  '  u.glow.color.setHex(GLOW_TINT);',
];

const MUTATIONS = [
  {
    name: 'elite-reset-removed',
    file: 'src/enemies.js',
    from: FROM_RESET,
    to: "  d.userData.speedMult = 1; // MUTATION 2026-11-07: the elite-skin reset REMOVED (flag/scale/tint/r) — a former elite's skin leaks into the reused pool slot. The speedMult initialization STAYS (the block is also speedMult's sole initializer on fresh pool slots — dropping it ghosts the raiders, NaN steering, two recorded aborts).",
    expectFail: 'former elite respawns normal',
    keepPassing: ['elite gunner stats', 'wave 1 composition', 'boss reward'],
  },
  {
    name: 'table-bypass',
    file: 'src/enemies.js',
    from: [
      '  const row = w <= TABLE_MAX_WAVE ? WAVE_TABLE[w] : undefined; // story-019: waves 1-5 read the table, 6+ the derived fallback (the boundary — see the header)',
      '  E.waveTable = row ? { gunner: row.gunner, rammer: row.rammer } : null; // a COPY — the live kind budget spawnRaider drains; the authored row stays pristine',
    ],
    to: '  E.waveTable = null; // MUTATION 2026-11-07: the table is BYPASSED — every wave rolls the stochastic rammerShare split.',
    expectFail: 'wave 1 composition is the authored table split',
    keepPassing: ['table totals equal the derived waveCount', 'table↔derived boundary BOTH ways'],
  },
];

for (const m of MUTATIONS) {
  console.log(`\n===== MUTATION ${m.name} =====`);
  const raw = fs.readFileSync(m.file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const from = m.from.join(eol);
  if (!raw.includes(from)) { console.error(`ANCHOR MISSING for ${m.name} (eol ${JSON.stringify(eol)}) — aborting this mutation`); continue; }
  if (raw.includes(m.to)) { console.error(`MUTATION ${m.name} looks already applied — aborting`); continue; }
  fs.writeFileSync(m.file, raw.replace(from, m.to));
  console.log(`applied ${m.name} (eol ${JSON.stringify(eol)})`);
  try {
    execSync('npm run build', { stdio: 'ignore' });
    const out = execSync('node tools/flow-check.mjs', { encoding: 'utf8', timeout: 40 * 60 * 1000 });
    fs.writeFileSync(`${EV}/flow-mutation-${m.name}.txt`, out + '\nEXIT=0 (script ignored the suite exit)\n');
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || `\n[runner] exit ${e.status}`);
    fs.writeFileSync(`${EV}/flow-mutation-${m.name}.txt`, out + `\nEXIT=${e.status}\n`);
  }
  const saved = fs.readFileSync(`${EV}/flow-mutation-${m.name}.txt`, 'utf8');
  const applied = saved.includes('FAIL  ' + m.expectFail);
  const summary = (saved.match(/FLOW-CHECK (PASS|FAIL) — .*/) || ['(no summary)'])[0];
  console.log(`verified-applied(${m.expectFail}): ${applied ? 'RED RECORDED' : '*** NOT RED — see the report (the reset mutation was verified on the focused harness) ***'}`);
  console.log(summary);
  for (const kp of m.keepPassing) {
    console.log(`  keep-passing "${kp}": ${saved.includes('PASS  ' + kp) ? 'green' : '*** NOT GREEN ***'}`);
  }
  execSync(`git checkout -- ${m.file}`);
  try { execSync('taskkill /F /IM msedge.exe', { stdio: 'ignore' }); } catch {}
  console.log(`restored ${m.file}`);
}
execSync('npm run build', { stdio: 'ignore' }); // the good bundle back on disk
console.log('\nMUTATIONS #2 DONE — final build restored');
