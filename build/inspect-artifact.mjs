// Scratch inspect: decode data-URL modules embedded in index.html and list their imports.
import fs from 'node:fs';
const h = fs.readFileSync('index.html', 'utf8');
const m = [...h.matchAll(/data:text\/javascript;base64,([A-Za-z0-9+/=]+)"/g)];
console.log('data URLs found:', m.length);
m.forEach((x, i) => {
  const code = Buffer.from(x[1], 'base64').toString('utf8');
  const imp = [...code.matchAll(/from\s*["']([^"']+)["']/g)].map((z) => z[1]);
  console.log(`--- data URL ${i}  ${Math.round(code.length / 1024)} KB`);
  console.log('bare imports:', JSON.stringify(imp.filter((s) => !s.startsWith('.'))).slice(0, 400));
});
