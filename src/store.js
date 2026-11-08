// STAGE TWO — persistent high-score storage (§8.4). Story-011: the STORE banner moved here
// verbatim from main.js. Self-contained by design: no imports at all (and none from main.js).
// story-007: storage is lazy. The first localStorage touch on a cold profile stalls the main
// thread 3-5 s (Chromium builds its storage database synchronously), so the probe must not run
// during module eval nor inside title.enter. getStorage() memoizes the probe; boot() warms it
// behind the rendered title — storeStart/storeEnd fire there now, never before the 'title' mark.
let storageImpl = null;
export function getStorage() {
  if (storageImpl) return storageImpl;
  try {
    window.localStorage.setItem('__s2_probe', '1');
    window.localStorage.removeItem('__s2_probe');
    storageImpl = { get: (k) => window.localStorage.getItem(k), set: (k, v) => window.localStorage.setItem(k, v) };
  } catch (e) {
    // private mode / blocked storage — session-only memory; never crash on storage
    const mem = new Map();
    console.warn('[stage2] localStorage blocked; high score is session-only:', e && e.message);
    storageImpl = { get: (k) => (mem.has(k) ? mem.get(k) : null), set: (k, v) => { mem.set(k, String(v)); } };
  }
  return storageImpl;
}
export const HIGHSCORE_KEY = 'stage2.highscore';
export function storageWarm() { // T1 (visual-audit F2-6): "not warm yet" must be distinguishable
  // from "record is 0" — a cold store holds the record line's placeholder (hud.js
  // refreshRecordLine) instead of painting the false pre-warm 0. Self-contained like the rest
  // of this module; the readHighscore pre-warm guard is the precedent.
  return storageImpl !== null;
}
export function readHighscore() {
  if (!storageImpl) return 0; // story-007: pre-warm read never triggers the probe — title renders 0, warm-up re-renders the real value
  try {
    const n = Number(JSON.parse(storageImpl.get(HIGHSCORE_KEY) ?? '0'));
    return Number.isFinite(n) && n >= 0 ? n : 0; // corrupt values read as 0, never NaN (§8.9)
  } catch { return 0; }
}
export function writeHighscore(n) {
  try { getStorage().set(HIGHSCORE_KEY, String(Math.max(0, Math.floor(Number(n) || 0)))); }
  catch (e) { // stage-1 review: the memory fallback cannot throw — a throw here means the REAL
    // backend refused the write (quota/private-mode edge). Never pretend it was saved.
    console.warn('[stage2] highscore write failed — score not persisted:', e && e.message);
  }
}

// story-020: the mute choice rides the SAME guarded store and the SAME contracts as the
// highscore pair above — story-007 laziness (a pre-warm read never triggers the capability
// probe), §8.9 (a corrupt/garbage value reads as the safe default, never as truthy), and the
// stage-1 honest-warn rule (a refused write is warned about, never pretended saved). Any
// future player setting lands on this same surface (the stage-5 scope record: mute-only).
export const MUTED_KEY = 'stage2.muted';
export function readMuted() {
  if (!storageImpl) return false; // story-007: pre-warm read never triggers the probe — the readHighscore pre-warm guard is the precedent
  try {
    return storageImpl.get(MUTED_KEY) === '1'; // ONLY the canonical '1' is muted — 'garbage', '2', '0', null all read unmuted (§8.9)
  } catch { return false; }
}
export function writeMuted(m) {
  try { getStorage().set(MUTED_KEY, m ? '1' : '0'); }
  catch (e) { // stage-1 review (writeHighscore precedent): a throw means the REAL backend refused — never pretend it was saved
    console.warn('[stage2] muted write failed — setting not persisted:', e && e.message);
  }
}
export function readMutedRaw() { // story-020 probe seam: the RAW stored value for the harness
  // (window.__stage2.mutedRaw — corrupt seeds must stay visible to flow-check). Guarded like
  // the pair: pre-warm returns null without triggering the probe, never throws.
  if (!storageImpl) return null;
  try { return storageImpl.get(MUTED_KEY); } catch { return null; }
}

// stage-6 W1 (aim overhaul): the aim-lock choice rides the SAME surface and the SAME contracts
// as the muted pair above — story-007 laziness (a pre-warm read never triggers the capability
// probe), the §8.9 corrupt-reads-safe rule, and the stage-1 honest-warn rule. One deliberate
// divergence from the mute pair, recorded: the lock DEFAULT is ON (the audit's opt-out-able
// assist, ux-audit F1b), so the semantics are "unwritten key → ON; ANY stored value that is
// not the canonical '1' → OFF" — the user's own '0', and corrupt seeds ('garbage', '2'),
// degrade to manual aim, the conservative fallback (the muted pair reads ==='1' because its
// default is false; this pair clamps around ON-with-only-'1'-canonical). Still self-contained:
// store.js keeps importing nothing.
export const LOCK_KEY = 'stage2.lock';
export function readLock() {
  if (!storageImpl) return true; // story-007: pre-warm read never triggers the probe — default ON
  try {
    const v = storageImpl.get(LOCK_KEY);
    return v == null ? true : v === '1'; // ONLY the canonical '1' is ON — 'garbage'/'2'/'0' read OFF (§8.9)
  } catch { return true; }
}
export function writeLock(l) {
  try { getStorage().set(LOCK_KEY, l ? '1' : '0'); }
  catch (e) { // stage-1 review (writeMuted precedent): a throw means the REAL backend refused — never pretend it was saved
    console.warn('[stage2] aim-lock write failed — setting not persisted:', e && e.message);
  }
}
export function readLockRaw() { // stage-6 W1 probe seam (readMutedRaw precedent): the RAW stored value —
  // corrupt seeds visible to the harness (window.__stage2.lockRaw). Guarded like the pair.
  if (!storageImpl) return null;
  try { return storageImpl.get(LOCK_KEY); } catch { return null; }
}
