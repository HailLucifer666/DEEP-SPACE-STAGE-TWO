// STAGE TWO — acyclic import-graph proof (story-011). Dependency-free: plain node script,
// no npm packages (node:fs + node:path only). Parses static imports in src/*.js, builds the
// module graph, fails (exit 1) on ANY cycle — story-011 wiring rule #1 ("ES import cycles
// are a defect even when they appear to work"). Also asserts the structural rules the split
// commits to: store.js imports nothing local; nothing imports main.js; main.js ≤ 500 lines.
// Usage: node tools/dep-check.mjs   (exit 0 = acyclic + rules hold; prints the graph)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
const graph = {}; // module -> [dep modules]

for (const f of files) {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8');
  const deps = new Set();
  // static imports: import ... from './x.js' | import './x.js' | import ... from 'bare'
  const re = /import\s+(?:[\s\S]*?from\s+)?['"]([^'"]*)['"]/g;
  let m;
  while ((m = re.exec(text))) {
    const spec = m[1];
    if (spec === 'stage-two-lib' || spec === 'three' || spec.startsWith('three/') || spec.startsWith('../node_modules/')) continue; // bare lib imports — esbuild bundles them via the alias; addons ride node_modules directly
    if (spec.startsWith('./')) deps.add(spec.replace('./', ''));
    else { console.error(`[dep-check] ${f}: unexpected bare import "${spec}"`); process.exit(1); }
  }
  graph[f] = [...deps].sort();
}

const failures = [];

// rule: store.js is self-contained — zero imports at all
if (graph['store.js']?.length) failures.push(`store.js must import nothing (has: ${graph['store.js'].join(', ')})`);

// rule: nothing imports main.js (main is the composition ROOT)
for (const [f, deps] of Object.entries(graph)) if (deps.includes('main.js')) failures.push(`${f} imports main.js — forbidden`);

// rule: TD-003 — main.js ≤ 500 physical lines (same metric as the ledger's "791-line main.js")
const mainText = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
const mainLines = mainText.split('\n').length - (mainText.endsWith('\n') ? 1 : 0);
if (mainLines > 500) failures.push(`main.js is ${mainLines} lines (> 500)`);

// cycle detection: DFS with colors
const WHITE = 0, GRAY = 1, BLACK = 2;
const color = Object.fromEntries(files.map((f) => [f, WHITE]));
const stack = [];
function visit(n) {
  color[n] = GRAY; stack.push(n);
  for (const d of graph[n] ?? []) {
    if (color[d] === GRAY) {
      const cyc = [...stack.slice(stack.indexOf(d)), d];
      failures.push(`import cycle: ${cyc.join(' -> ')}`);
    } else if (color[d] === WHITE) visit(d);
  }
  stack.pop(); color[n] = BLACK;
}
for (const f of files) if (color[f] === WHITE) visit(f);

console.log('import graph (module -> deps):');
for (const [f, deps] of Object.entries(graph)) console.log(`  ${f}  ->  ${deps.length ? deps.join(', ') : '(none)'}`);
console.log(`main.js lines: ${mainLines} (limit 500)`);

if (failures.length) {
  console.error('[dep-check] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[dep-check] PASS — acyclic, structural rules hold');
