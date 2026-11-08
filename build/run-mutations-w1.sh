#!/bin/bash
# stage-6 W1 mutation runs (post-green). Each: mutate -> build -> FULL flow-check -> record -> restore -> rebuild.
# Restore is a backup-copy (aim-assist.js is new in this story; git checkout -- needs a committed baseline —
# the backup is byte-identical to the committed file, verified by the post-run git status).
# Usage: bash build/run-mutations-w1.sh   (run from the repo root)
set -u
cd "/e/Game Build"
EV=production/qa/evidence/stage6-w1
EDGE="C:/Program Files (x86)/Microsoft/EdgeCore/157.0.4341.42/msedge.exe"

cp src/aim-assist.js "$EV/aim-assist.js.mutation-backup"

echo "=== MUTATION (a): aim-assist.js bias clamp removed (Math.min(BIAS_MAX_RAD, ang) -> ang) ==="
sed -i 's|const rot = Math.min(BIAS_MAX_RAD, ang); // THE CLAMP — mutation (a) removes this min() and the bias asserts red|const rot = ang; // MUTATION (a) 2026-11-08: bias clamp removed (verified-applied run; restored after)|' src/aim-assist.js
grep -n "MUTATION (a) 2026-11-08" src/aim-assist.js
npm run build > /dev/null 2>&1
EDGE="$EDGE" node tools/flow-check.mjs > "$EV/flow-mutation-biasclamp.txt" 2>&1
echo "mutation (a) exit: $?"
grep -E "^FAIL" "$EV/flow-mutation-biasclamp.txt" | head -8
tail -2 "$EV/flow-mutation-biasclamp.txt"
cp "$EV/aim-assist.js.mutation-backup" src/aim-assist.js
npm run build > /dev/null 2>&1

echo "=== MUTATION (b): aim-assist.js acquire cone widened 6 -> 180 ==="
sed -i 's|const ACQUIRE_DEG = 6;                       // acquire cone from nose-forward|const ACQUIRE_DEG = 180;                      // MUTATION (b) 2026-11-08: acquire cone widened to 180° (verified-applied run; restored after)|' src/aim-assist.js
grep -n "MUTATION (b) 2026-11-08" src/aim-assist.js
npm run build > /dev/null 2>&1
EDGE="$EDGE" node tools/flow-check.mjs > "$EV/flow-mutation-cone180.txt" 2>&1
echo "mutation (b) exit: $?"
grep -E "^FAIL" "$EV/flow-mutation-cone180.txt" | head -8
tail -2 "$EV/flow-mutation-cone180.txt"
cp "$EV/aim-assist.js.mutation-backup" src/aim-assist.js
rm "$EV/aim-assist.js.mutation-backup"
npm run build > /dev/null 2>&1
echo "=== mutations done (aim-assist.js restored, build restored) ==="
