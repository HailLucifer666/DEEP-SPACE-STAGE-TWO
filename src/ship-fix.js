// STAGE TWO — ship orientation math (SHIP1). PURE functions, no three import, so
// tools/basis-check.mjs tests the exact code the game runs (never a copy of it).
//
// Contract: the adapter rotation R maps the model's RAW nose axis to +Y and its RAW
// top axis to -Z. Combat's tilt group (rotation.x = PI/2) then maps adapter +Y -> +Z
// forward and adapter -Z -> +Y up; launch stands the nose up on the pad.
// Row form (row-major, matches THREE.Matrix4().set(...)):
//   R = [ s ; n ; -t ],  s = -(n x t)   ->  R·n = +Y, R·t = -Z, det = +1, for every
//   perpendicular (nose, top) pair — a mirror is impossible by construction.

export const AXES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

const AXIS_TABLE = {
  '+X': [1, 0, 0], '-X': [-1, 0, 0],
  '+Y': [0, 1, 0], '-Y': [0, -1, 0],
  '+Z': [0, 0, 1], '-Z': [0, 0, -1],
};

export function axisVec(a) {
  const v = AXIS_TABLE[a];
  if (!v) throw new Error(`bad axis "${a}" — use one of ${AXES.join(' ')}`);
  return v.slice();
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const perp = (a, b) => Math.abs(dot3(a, b)) < 0.999;

// Rows of the adapter rotation: [s, n, -t] with s = -(n x t).
// Throws on a non-perpendicular pair — main.js catches and falls back to identity;
// nextNose/nextTop never produce this state.
export function adapterRows(nose, top) {
  const n = axisVec(nose);
  const t = axisVec(top);
  if (!perp(n, t)) throw new Error(`nose ${nose} and top ${top} are not perpendicular (dot=${dot3(n, t)})`);
  const cx = n[1] * t[2] - n[2] * t[1];
  const cy = n[2] * t[0] - n[0] * t[2];
  const cz = n[0] * t[1] - n[1] * t[0];
  return [-cx, -cy, -cz, n[0], n[1], n[2], -t[0], -t[1], -t[2]];
}

// Apply rows to a vector — the proof that the row form IS the rotation.
export function applyRows(rows, v) {
  return [
    rows[0] * v[0] + rows[1] * v[1] + rows[2] * v[2],
    rows[3] * v[0] + rows[4] * v[1] + rows[5] * v[2],
    rows[6] * v[0] + rows[7] * v[1] + rows[8] * v[2],
  ];
}

// Determinant of the upper 3x3 — +1 = proper rotation, -1 = mirror (the mutation red).
export function rowsDet(rows) {
  const [a, b, c, d, e, f, g, h, i] = rows;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

// N key: cycle the nose through all 6 axes. If the current top became parallel to the
// new nose, top moves to the first perpendicular axis in AXES order (no identity jumps).
export function nextNose(nose, top) {
  const newNose = AXES[(AXES.indexOf(nose) + 1) % AXES.length];
  const newTop = perp(axisVec(newNose), axisVec(top))
    ? top
    : AXES.find((a) => perp(axisVec(newNose), axisVec(a)));
  return { nose: newNose, top: newTop };
}

// T key: cycle the top through the 4 axes perpendicular to the CURRENT nose — never
// parallel. A parallel top (hand-edited MODEL_FIX) self-heals to the first option.
export function nextTop(nose, top) {
  const opts = AXES.filter((a) => perp(axisVec(nose), axisVec(a)));
  const i = (opts.indexOf(top) + 1) % opts.length; // indexOf -1 -> 0
  return { nose, top: opts[i] };
}
