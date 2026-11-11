// tools/asset-manifest.mjs
// Validates external assets against tools/asset-manifest.json
// Enforces CC0/CC-BY provenance, SHA-256 hashes, file budgets, and attribution metadata.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MANIFEST_PATH = path.join(ROOT, 'tools', 'asset-manifest.json');

export function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found at ${MANIFEST_PATH}`);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

export function validateAssets() {
  const manifest = loadManifest();
  const errors = [];
  let totalRawBytes = 0;
  let totalBase64Bytes = 0;

  for (const asset of manifest.assets) {
    if (asset.status !== 'installed') {
      continue;
    }

    const filePath = path.join(ROOT, asset.targetFile);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing asset file for ${asset.id}: ${asset.targetFile}`);
      continue;
    }

    const buf = fs.readFileSync(filePath);
    const size = buf.length;
    totalRawBytes += size;
    totalBase64Bytes += Math.ceil(size * 4 / 3);

    if (asset.budgetBytes && size > asset.budgetBytes) {
      errors.push(`Asset ${asset.id} exceeds budget: ${size} bytes > ${asset.budgetBytes} bytes`);
    }

    if (asset.sha256) {
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      if (hash !== asset.sha256) {
        errors.push(`SHA-256 mismatch for ${asset.id}: expected ${asset.sha256}, got ${hash}`);
      }
    }

    if (!asset.license || !asset.sourceUrl) {
      errors.push(`Asset ${asset.id} missing license or sourceUrl`);
    }
  }

  const { maxTotalRawBytes, maxTotalBase64Bytes } = manifest.limits || {};
  if (maxTotalRawBytes && totalRawBytes > maxTotalRawBytes) {
    errors.push(`Total raw asset size exceeds limit: ${totalRawBytes} > ${maxTotalRawBytes}`);
  }
  if (maxTotalBase64Bytes && totalBase64Bytes > maxTotalBase64Bytes) {
    errors.push(`Total base64 asset payload exceeds limit: ${totalBase64Bytes} > ${maxTotalBase64Bytes}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      totalInstalledAssets: manifest.assets.filter(a => a.status === 'installed').length,
      totalPendingAssets: manifest.assets.filter(a => a.status === 'pending_import').length,
      totalRawBytes,
      totalBase64Bytes
    }
  };
}

if (process.argv[1] === __filename) {
  const res = validateAssets();
  console.log(`[asset-manifest] Assets checked: ${res.stats.totalInstalledAssets} installed, ${res.stats.totalPendingAssets} pending.`);
  console.log(`[asset-manifest] Installed payload: ${(res.stats.totalRawBytes / 1024).toFixed(1)} KB raw, ~${(res.stats.totalBase64Bytes / 1024).toFixed(1)} KB base64.`);
  if (!res.valid) {
    console.error('[asset-manifest] FAIL:');
    for (const err of res.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log('[asset-manifest] Manifest check PASS.');
}

