// STAGE TWO — COMBAT DRESSING (story-017, full-3d-flight GDD §3.6): the world goes 3D.
// Combat-only volumetric dressing so the sphere reads as a place rather than a math bound:
//   1. Ambient combat field — one InstancedMesh (~120 rocks) seeded deterministically in a
//      spherical shell 25-75 u from O, static within a slowly rotating group (~0.005 rad/s).
//      NO per-instance updates; NO collision (the lane stream already has none). Mirrors the
//      lane stream's geometry/material family (launch.js L142-143: DodecahedronGeometry(1,0)
//      + MeshStandardMaterial rock grey) but seeds from a fixed PRNG — probe asserts are
//      stable across runs.
//   2. Boundary shell visual — a faint additive sphere at R_HARD (the rim-ring/rift material
//      grammar: additive/transparent/depthWrite:false, DoubleSide — the player flies inside),
//      opacity driven by 3D proximity exactly like the equator ring's driver (combat.js L258),
//      capped at SHELL_VISUAL_MAX_OPACITY (R8: stays under the 0.85 bloom threshold,
//      non-emissive; TD-013's degrade latch is a safety net, not a design target).
// Lifecycle (the rim ring's exact pattern): created ONCE in prepareCombat (baseline
// membership — restarts allocate nothing new), shown in enterCombat, hidden in clearCombat.
// Tuning knobs live in src/combat.js header (AMBIENT_FIELD_COUNT, AMBIENT_FIELD_SEED,
// SHELL_VISUAL_MAX_OPACITY — GDD §7) and arrive via the cfg object from combat's
// prepareCombat (combat.js is the owning module; this module never imports it).
import { THREE } from 'stage-two-lib';

const D = {
  ready: false, scene: null, cfg: null,
  group: null, field: null, shell: null,
  lpos: null, fill: null, // local instance positions (Float32Array) + static shell-fill sample
  rocks: [], // { lx, ly, lz, radius } local sphere obstacles
  tmp: new THREE.Vector3(),
};

// deterministic PRNG (mulberry32) — the field's placement must be stable across runs so the
// harness's shell-fill/clearance asserts are reproducible; Math.random() would flake them
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function prepareDressing(scene, cfg) {
  if (D.ready) return;
  Object.assign(D, { scene, cfg, ready: true });

  const n = cfg.AMBIENT_FIELD_COUNT;
  const rng = mulberry32(cfg.AMBIENT_FIELD_SEED);

  // ambient field — uniform shell band 25-75 u from O. Direction via the cosθ method with the
  // fixed PRNG (THREE.Vector3.randomDirection uses Math.random internally — not usable here);
  // radius uniform in [25, 75]. Scale/rotation mirror the lane stream (0.8 + rng·3.6, random
  // euler), so the field reads as the same rock family.
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b6257, roughness: 0.95, metalness: 0.05 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false; // instances spread ±75 around O — origin bounds would cull the whole field
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _e = new THREE.Euler(), _m = new THREE.Matrix4();
  D.lpos = new Float32Array(n * 3);
  D.rocks.length = 0;
  let minR = Infinity, maxR = 0;
  for (let i = 0; i < n; i++) {
    const theta = 2 * Math.PI * rng();
    const phi = Math.acos(2 * rng() - 1);
    const rad = 25 + rng() * 50;
    const x = Math.sin(phi) * Math.cos(theta) * rad;
    const y = cfg.ARENA_Y + Math.sin(phi) * Math.sin(theta) * rad;
    const z = Math.cos(phi) * rad;
    D.lpos[i * 3] = x; D.lpos[i * 3 + 1] = y; D.lpos[i * 3 + 2] = z;
    minR = Math.min(minR, rad); maxR = Math.max(maxR, rad);
    _p.set(x, y, z);
    _e.set(rng() * 6.28, rng() * 6.28, rng() * 6.28); _q.setFromEuler(_e);
    const s = 0.8 + rng() * 2.7;
    _s.setScalar(s);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    D.rocks.push({ lx: x, ly: y, lz: z, radius: s * 0.95 });
  }
  mesh.instanceMatrix.needsUpdate = true;
  D.fill = { minR3: +minR.toFixed(2), maxR3: +maxR.toFixed(2), samples: n };

  // boundary shell visual — faint additive sphere at R_HARD.
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.R_HARD, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  shell.renderOrder = 5; // same additive layer as the equator ring (combat.js L433)

  D.group = new THREE.Group();
  D.group.add(mesh, shell);
  scene.add(D.group);
  D.field = mesh; D.shell = shell;

  // live surface for the harness's lifecycle reads — installed here (probe parity: probes and
  // dressing write __stage2 keys directly; main.js is untouched). Mirrors visibility at any
  // phase, so flow-check can witness clearCombat's hide / enterCombat's re-show.
  Object.defineProperty(window.__stage2, 'dressingLive', {
    configurable: true,
    value: () => ({
      fieldVisible: D.group.visible,
      shellVisible: D.shell.visible,
      shellOpacity: +D.shell.material.opacity.toFixed(4),
      ambientCount: D.field.count,
    }),
  });

  D.group.visible = false; // created hidden — enterCombat shows it (rim-ring lifecycle)
}

export function showDressing() { if (D.group) { D.group.visible = true; D.shell.visible = true; } }
export function hideDressing() { if (D.group) { D.group.visible = false; D.shell.visible = false; D.shell.material.opacity = 0; } }

export function tickDressing(dt, r3) {
  if (!D.group || !D.group.visible) return;
  D.group.rotation.y += 0.005 * dt; // single transform on the group — no per-instance updates
  const c = D.cfg;
  const k = (r3 - c.R_SOFT) / (c.R_HARD - c.R_SOFT); // the ring's driver grammar (combat.js L258), 3D
  D.shell.material.opacity = Math.max(0, Math.min(1, k)) * c.SHELL_VISUAL_MAX_OPACITY;
}

/* ---------- probe surfaces (dressingProbeTick reads these) ---------- */
export function fieldVisible() { return D.group ? D.group.visible : false; }
export function shellVisible() { return D.shell ? D.shell.visible : false; }
export function fieldCount() { return D.field ? D.field.count : 0; }
export function shellFill() { return D.fill; }
export function shellOpacity() { return D.shell ? D.shell.material.opacity : 0; }
export function shellMaterial() {
  const m = D.shell.material;
  return { additive: m.blending === THREE.AdditiveBlending, transparent: m.transparent, depthWrite: m.depthWrite };
}

export function collideRocks(pos, radius, outNormal) {
  const rocks = D.rocks;
  if (!rocks || !rocks.length || !D.group) return 0;
  const yaw = D.group.rotation.y || 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (let i = 0, n = rocks.length; i < n; i++) {
    const r = rocks[i];
    const wx = r.lx * cy + r.lz * sy;
    const wy = r.ly;
    const wz = -r.lx * sy + r.lz * cy;
    const dx = pos.x - wx, dy = pos.y - wy, dz = pos.z - wz;
    const d2 = dx * dx + dy * dy + dz * dz;
    const minD = radius + r.radius;
    if (d2 < minD * minD) {
      const d = Math.sqrt(d2) || 1e-6;
      if (outNormal) outNormal.set(dx / d, dy / d, dz / d);
      return minD - d;
    }
  }
  return 0;
}

export function getRock(index) {
  const r = D.rocks[index];
  if (!r) return null;
  const yaw = D.group ? D.group.rotation.y : 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const wx = r.lx * cy + r.lz * sy;
  const wy = r.ly;
  const wz = -r.lx * sy + r.lz * cy;
  return { lx: r.lx, ly: r.ly, lz: r.lz, radius: r.radius, wx, wy, wz };
}
export function nearestTo(pos) { // min 3D distance from `pos` to any instance (world-space)
  if (!D.group || !D.field) return null;
  D.group.updateMatrixWorld(true);
  const mw = D.group.matrixWorld;
  let best = Infinity;
  for (let i = 0; i < D.field.count; i++) {
    D.tmp.set(D.lpos[i * 3], D.lpos[i * 3 + 1], D.lpos[i * 3 + 2]).applyMatrix4(mw);
    const d2 = D.tmp.distanceToSquared(pos);
    if (d2 < best) best = d2;
  }
  return { d: Math.sqrt(best), count: D.field.count };
}
