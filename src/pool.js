// STAGE TWO — lazy object pool for combat entities (S4).
// First spawn creates the object; later spawns reuse hidden instances, so restart
// cycles allocate nothing new (baseline-clean guarantee). clear() hides and drains all.
// Contract: items are meshes/sprites with `visible` driving draw, `userData.alive`
// driving sim; kill(it) is the single way to retire one.

export function makePool(scene, make, n) {
  const items = [];
  let idx = 0;
  let live = 0;
  return {
    get live() { return live; },
    spawn() {
      // reuse-first: a dead item comes back before any new allocation, so restart
      // cycles allocate nothing once the pool is warm (baseline-clean guarantee).
      // idx only matters at saturation (steal oldest slot).
      let it = items.find((x) => !x.userData.alive);
      if (!it) {
        if (items.length >= n) it = items[idx++ % n];
        else {
          it = make();
          it.visible = false;
          it.userData.alive = false;
          scene.add(it);
          items.push(it);
        }
      }
      it.visible = true;
      it.userData.alive = true;
      live++;
      return it;
    },
    update(dt, fn) {
      live = 0;
      for (const it of items) {
        if (!it.userData.alive) continue;
        live++;
        fn(it, dt);
      }
    },
    kill(it) {
      if (!it.userData.alive) return;
      it.userData.alive = false;
      it.visible = false;
      live = Math.max(0, live - 1);
    },
    clear() {
      for (const it of items) { it.userData.alive = false; it.visible = false; }
      live = 0;
    },
  };
}
