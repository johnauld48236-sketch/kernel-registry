#!/usr/bin/env node
/**
 * scripts/test-state-update.js
 *
 * Smoke test for POST /api/nodes/:root_hash/state against the
 * live deployment. Targets Scout Signal (node 001).
 *
 * Reads KERNEL_REGISTRY_API_KEY from .env.local via the inline
 * dotenv loader (KERNEL_REGISTRY_SECRET is also loaded into the
 * environment by the loader, though only the API key is needed
 * for this client-side test — the secret only matters server-side
 * during root hash generation).
 *
 * Run:
 *   node scripts/test-state-update.js
 *
 * Expected: 200 OK with the updated current_hash and the
 * governance_shape_hash + kpi_signatures echoed back.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

// ── Load .env.local if present ─────────────────────────────────
const envPath = resolve(repoRoot, '.env.local');
if (existsSync(envPath)) {
  const text = readFileSync(envPath, 'utf-8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const API_KEY = process.env.KERNEL_REGISTRY_API_KEY;
if (!API_KEY) {
  console.error('Missing KERNEL_REGISTRY_API_KEY env var.');
  console.error('Set it in .env.local or export it in your shell.');
  process.exit(1);
}

// ── Test fixture ───────────────────────────────────────────────
const ROOT_HASH = '68b7bebc8caecc2c0a5de1e076f9d0599b4a6acc80bc07709bb33a05f1173055';
const ENDPOINT = `https://kernel-registry.vercel.app/api/nodes/${ROOT_HASH}/state`;
const body = {
  governance_shape_hash: 'sha256-test-governance-shape-april-8-2026',
  kpi_signatures: ['CVE Assessment', 'TARA Risk Score', 'Patch Availability'],
  changed_by: 'john@scoutsignal.ai',
};

console.log('POST', ENDPOINT);
console.log('Body:', JSON.stringify(body, null, 2));
console.log('');

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

console.log(`Status: ${res.status} ${res.statusText}`);
console.log('Headers:');
for (const [k, v] of res.headers) {
  console.log(`  ${k}: ${v}`);
}
console.log('');

const text = await res.text();
let parsed;
try {
  parsed = JSON.parse(text);
  console.log('Response (JSON):');
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  console.log('Response (text):');
  console.log(text);
}

if (res.status >= 200 && res.status < 300) {
  console.log('');
  console.log('✓ State update accepted.');
} else {
  console.log('');
  console.log('✗ Request failed.');
  process.exit(1);
}
