// SHIP1 orientation check — imports the REAL src/ship-fix.js, never a copy (patch B).
// For every nose x perpendicular top (6 x 4 = 24 combos) assert:
//   R·nose = (0,1,0)   (raw nose -> adapter +Y, launch up)
//   R·top  = (0,0,-1)  (raw top  -> adapter -Z, combat up after tilt)
//   det(R) = +1        (proper rotation — a mirror would be -1)
// Mutation note (2026-11-03): with the negate on s removed, the DET assert goes red
// (-1) while nose/top asserts stay green — seen red before trusted.
// Also guards the N/T key invariants (nextNose/nextTop): every cycled pair stays
// perpendicular, T never returns a parallel top.
import { AXES, axisVec, adapterRows, applyRows, rowsDet, nextNose, nextTop } from '../src/ship-fix.js';

const eq3 = (v, w) => v[0] === w[0] && v[1] === w[1] && v[2] === w[2];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

let pass = 0;
let fail = 0;
const fails = [];

for (const nose of AXES) {
  const tops = AXES.filter((a) => Math.abs(dot3(axisVec(nose), axisVec(a))) === 0);
  for (const top of tops) {
    const rows = adapterRows(nose, top);
    const rn = applyRows(rows, axisVec(nose));
    const rt = applyRows(rows, axisVec(top));
    const det = rowsDet(rows);
    const ok = eq3(rn, [0, 1, 0]) && eq3(rt, [0, 0, -1]) && det === 1;
    if (ok) pass++;
    else { fail++; fails.push(`${nose}/${top}: nose->${rn} top->${rt} det=${det}`); }
  }
}

// N/T invariants: 12 nextNose steps + 12 nextTop steps from every starting pair
let ntFail = 0;
for (const nose of AXES) {
  const tops = AXES.filter((a) => Math.abs(dot3(axisVec(nose), axisVec(a))) === 0);
  for (const top of tops) {
    const nn = nextNose(nose, top);
    const nt = nextTop(nose, top);
    for (const [tag, p] of [['nextNose', nn], ['nextTop', nt]]) {
      if (Math.abs(dot3(axisVec(p.nose), axisVec(p.top))) !== 0) ntFail++;
      if (AXES.indexOf(p.nose) === -1 || AXES.indexOf(p.top) === -1) ntFail++;
      if (tag === 'nextTop' && p.nose === nose && p.top === top) ntFail++; // T must move
    }
    // nextNose must land perpendicular to some top (adapterRows must never throw)
    try { adapterRows(nn.nose, nn.top); adapterRows(nt.nose, nt.top); }
    catch (e) { ntFail++; fails.push(`N/T threw: ${e.message}`); }
  }
}

console.log(`basis-check: ${pass}/24 combos PASS, ${fail} FAIL; N/T invariants ${ntFail === 0 ? 'OK' : ntFail + ' FAIL'}`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
if (pass !== 24) process.exit(1);
console.log('basis-check: 24/24 PASS');
