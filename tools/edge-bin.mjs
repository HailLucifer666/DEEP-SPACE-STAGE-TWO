import fs from 'node:fs';
import path from 'node:path';

export function resolveEdge() {
  if (process.env.EDGE && fs.existsSync(process.env.EDGE)) return process.env.EDGE;
  const roots = [
    'C:\\Program Files (x86)\\Microsoft\\EdgeCore',
    'C:\\Program Files\\Microsoft\\EdgeCore',
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const vers = fs.readdirSync(root)
        .filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const v of vers) {
        const cand = path.join(root, v, 'msedge.exe');
        if (fs.existsSync(cand)) return cand;
      }
    } catch {}
  }
  const app = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (fs.existsSync(app)) return app;
  const app64 = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
  if (fs.existsSync(app64)) return app64;
  throw new Error('msedge.exe not found; set EDGE env var');
}

export function rmProfile(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  } catch {}
}

