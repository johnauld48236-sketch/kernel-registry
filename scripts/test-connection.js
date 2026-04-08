#!/usr/bin/env node
/**
 * scripts/test-connection.js
 *
 * Smoke test for POST /api/connections against the live deployment.
 * Reads KERNEL_REGISTRY_API_KEY from .env.local (same tiny inline
 * dotenv loader as scripts/seed-existing-nodes.js — no extra
 * dependency).
 *
 * Hardcoded test fixture:
 *   node A: Scout Signal     (68b7be... — confirmed in repo)
 *   node B: C2A Intelligence (0facf0... — must exist as confirmed
 *           in the registry for this call to succeed)
 *   requested_by: john@scoutsignal.ai (passes the human-only check)
 *
 * Run:
 *   node scripts/test-connection.js
 *
 * Prints the full HTTP status, headers, and JSON response body.
 * No shell quoting required — all values are JS literals.
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
const ENDPOINT = 'https://kernel-registry.vercel.app/api/connections';
const body = {
  node_a_root_hash: '68b7bebc8caecc2c0a5de1e076f9d0599b4a6acc80bc07709bb33a05f1173055',
  node_b_root_hash: '0facf09b5ad17540cebf1f57ab23ffc9f54cc94a887ca6e1817c491b1b8507a5',
  shared_kpi_signatures: [],
  requested_by: 'john@scoutsignal.ai',
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
  console.log('✓ Connection request accepted.');
} else {
  console.log('');
  console.log('✗ Request failed.');
  process.exit(1);
}
