#!/usr/bin/env node
/**
 * scripts/test-confirm-connection.js
 *
 * End-to-end smoke test for PATCH /api/connections/:id/confirm.
 * Walks the live PENDING connection through both sides:
 *
 *   Call 1: confirm from Node 001 (Scout Signal) side
 *           Expected: 200 with state=PENDING, authorized_by_a set
 *
 *   Call 2: confirm from Node 002 (C2A) side
 *           Expected: 200 with state=CONFIRMED, authorized_at set
 *
 * Reads KERNEL_REGISTRY_API_KEY from .env.local via the inline
 * dotenv loader (same pattern as the other smoke scripts —
 * no extra dependency).
 *
 * Run:
 *   node scripts/test-confirm-connection.js
 *
 * Idempotent — re-running after both sides have confirmed will
 * return 200 with the message "Connection is already CONFIRMED —
 * no action taken" for both calls.
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
const CONNECTION_ID = '42a72b8f-3da8-41db-93c7-a869246c9e0c';
const NODE_001_HASH = '68b7bebc8caecc2c0a5de1e076f9d0599b4a6acc80bc07709bb33a05f1173055'; // Scout Signal
const NODE_002_HASH = '0facf09b5ad17540cebf1f57ab23ffc9f54cc94a887ca6e1817c491b1b8507a5'; // C2A
const ENDPOINT = `https://kernel-registry.vercel.app/api/connections/${CONNECTION_ID}/confirm`;

async function confirmSide(label, body, expectedState) {
  console.log('───────────────────────────────────────────────────────');
  console.log(label);
  console.log('PATCH', ENDPOINT);
  console.log('Body:', JSON.stringify(body, null, 2));
  console.log('');

  const res = await fetch(ENDPOINT, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  console.log(`Status: ${res.status} ${res.statusText}`);
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
    console.log('Response (JSON):');
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log('Response (text):');
    console.log(text);
    return null;
  }

  if (res.status !== 200) {
    console.log('');
    console.log(`✗ Expected 200, got ${res.status}.`);
    process.exit(1);
  }

  if (parsed.state !== expectedState) {
    console.log('');
    console.log(`⚠ Expected state=${expectedState}, got state=${parsed.state}.`);
    // Continue — second call may still succeed if first call was a re-run.
  } else {
    console.log('');
    console.log(`✓ State=${parsed.state} as expected.`);
  }

  return parsed;
}

console.log('Testing two-sided connection confirmation flow.');
console.log(`Connection: ${CONNECTION_ID}`);
console.log('');

// Call 1 — Node 001 (Scout Signal) side
const after1 = await confirmSide(
  'CALL 1 — Node 001 (Scout Signal) side',
  {
    confirmed_by: 'john@scoutsignal.ai',
    node_root_hash: NODE_001_HASH,
  },
  'PENDING',
);

console.log('');

// Call 2 — Node 002 (C2A) side
const after2 = await confirmSide(
  'CALL 2 — Node 002 (C2A) side',
  {
    confirmed_by: 'john@scoutsignal.ai',
    node_root_hash: NODE_002_HASH,
  },
  'CONFIRMED',
);

console.log('');
console.log('───────────────────────────────────────────────────────');
console.log('Final state summary:');
console.log(`  state:           ${after2?.state}`);
console.log(`  authorized_by_a: ${after2?.authorized_by_a}`);
console.log(`  authorized_by_b: ${after2?.authorized_by_b}`);
console.log(`  authorized_at:   ${after2?.authorized_at}`);
console.log('');

if (after2?.state === 'CONFIRMED' && after2?.authorized_at) {
  console.log('✓ Connection fully confirmed by both sides.');
  process.exit(0);
} else {
  console.log('⚠ Connection did not reach CONFIRMED state.');
  process.exit(1);
}
