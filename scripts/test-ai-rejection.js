#!/usr/bin/env node
/**
 * scripts/test-ai-rejection.js
 *
 * Negative test — proves the human-only governance law is enforced
 * at the state-update layer. Sends the same POST as
 * test-state-update.js but with changed_by="claude@anthropic.com".
 *
 * The lib/humans.js denylist matches "claude" and "anthropic" (and
 * several other AI patterns). The endpoint should reject with 403
 * before any DB write happens.
 *
 * Run:
 *   node scripts/test-ai-rejection.js
 *
 * Expected: 403 Forbidden with an error like
 *   "changed_by rejected: identity ... matches AI pattern ..."
 *
 * The script EXITS 0 on a 403 (the expected outcome — the law was
 * enforced) and exits 1 on any other status, including 200, since
 * a 200 here would mean the AI rejection guard is broken.
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

// ── Test fixture (same as test-state-update.js, but AI changed_by) ──
const ROOT_HASH = '68b7bebc8caecc2c0a5de1e076f9d0599b4a6acc80bc07709bb33a05f1173055';
const ENDPOINT = `https://kernel-registry.vercel.app/api/nodes/${ROOT_HASH}/state`;
const body = {
  governance_shape_hash: 'sha256-test-governance-shape-april-8-2026',
  kpi_signatures: ['CVE Assessment', 'TARA Risk Score', 'Patch Availability'],
  changed_by: 'claude@anthropic.com',
};

console.log('POST', ENDPOINT);
console.log('Body:', JSON.stringify(body, null, 2));
console.log('');
console.log('This test EXPECTS a 403. A 200 here means the governance law is broken.');
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

console.log('');
if (res.status === 403) {
  console.log('✓ AI rejection enforced — law upheld at the state-update layer.');
  process.exit(0);
} else {
  console.log(`✗ Unexpected status ${res.status}. Expected 403.`);
  if (res.status >= 200 && res.status < 300) {
    console.log('  CRITICAL: an AI identity was allowed to mutate state. Governance guard is broken.');
  }
  process.exit(1);
}
