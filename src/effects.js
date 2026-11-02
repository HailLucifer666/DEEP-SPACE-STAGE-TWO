// STAGE TWO — combat feedback effects (S4): pooled explosion sprites, red hit veil,
// camera kick on damage. Sprite physics mirrors launch.js's pooled-sprite pattern
// (velocity/ttl/opacity-fade), owned here so combat stays the orchestrator only.
import { THREE } from 'stage-two-lib';

const FX = { ready: false, scene: null, camera: null, pool: null, tex: null, kickAmp: 0, veilTimer: 0 };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const boomTex = () => canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.35, 'rgba(255,150,70,.9)'); r.addColorStop(1, 'rgba(255,80,30,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

export function prepareEffects(scene, camera) {
  if (FX.ready) return;
  FX.scene = scene; FX.camera = camera;
  FX.tex = boomTex();
  const items = [];
  let live = 0;
  FX.pool = {
    get live() { return live; },
    burst(p, n) {
      for (let i = 0; i < n; i++) {
        let it = items.find((x) => x.life <= 0);
        if (!it) {
          if (items.length >= 90) break; // overdraw cap (§10: pooled particles)
          const m = new THREE.SpriteMaterial({ map: FX.tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
          const s = new THREE.Sprite(m); s.visible = false;
          FX.scene.add(s);
          it = { s, m, life: 0, ttl: 1, vx: 0, vy: 0, vz: 0 };
          items.push(it);
        }
        const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
        it.ttl = it.life = 0.35 + Math.random() * 0.4;
        it.vx = Math.cos(a) * sp; it.vz = Math.sin(a) * sp; it.vy = (Math.random() - 0.3) * 4;
        it.s.position.set(p.x, p.y, p.z);
        it.s.scale.setScalar(0.5 + Math.random() * 0.8);
        it.s.visible = true;
        live++;
      }
    },
    update(dt) {
      live = 0;
      for (const it of items) {
        if (it.life <= 0) { it.s.visible = false; continue; }
        live++;
        it.life -= dt;
        const u = 1 - it.life / it.ttl;
        it.s.position.x += it.vx * dt; it.s.position.y += it.vy * dt; it.s.position.z += it.vz * dt;
        it.s.scale.multiplyScalar(1 + dt * 1.6);
        it.m.opacity = 0.95 * (1 - u * u);
      }
    },
    clear() { for (const it of items) { it.life = 0; it.s.visible = false; } live = 0; },
  };
  FX.ready = true;
}

export function explosion(p) { if (FX.ready) FX.pool.burst(p, 12); }
export function particleCount() { return FX.ready ? FX.pool.live : 0; }
export function tickEffects(dt) { // drives the explosion pool — was never called before (fixed 2026-11-03): particles never faded
  if (FX.ready) FX.pool.update(dt);
}

export function shake(amp) { FX.kickAmp = Math.min(0.5, FX.kickAmp + amp); }
export function applyShake(dt) { // combat camera calls this AFTER setting its own position
  const c = FX.camera;
  if (c && FX.kickAmp > 0.001) {
    c.position.x += (Math.random() * 2 - 1) * FX.kickAmp;
    c.position.y += (Math.random() * 2 - 1) * FX.kickAmp * 0.6;
    FX.kickAmp *= Math.exp(-6 * dt);
  }
}

export function hitVeil(ms = 260) { // red damage flash — DOM side, honest: real hits only
  const v = document.getElementById('hitveil');
  if (!v) return;
  v.classList.add('on');
  window.clearTimeout(FX.veilTimer);
  FX.veilTimer = window.setTimeout(() => v.classList.remove('on'), ms);
}

export function clearEffects() {
  if (FX.pool) FX.pool.clear();
  FX.kickAmp = 0;
  const v = document.getElementById('hitveil');
  if (v) v.classList.remove('on');
  window.clearTimeout(FX.veilTimer);
}
