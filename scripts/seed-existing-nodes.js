#!/usr/bin/env node
/**
 * scripts/seed-existing-nodes.js
 *
 * Seeds the registry_nodes table with the two existing node records
 * from /nodes/. Reads the JSON files, normalizes them to the
 * registry_nodes schema, inserts.
 *
 * Node 001 (Scout Signal): full registration record from repo. Inserts
 * with trust_state='confirmed' (already confirmed in repo).
 *
 * Node 002 (C2A Intelligence): the repo file is just a 6-field stub.
 * The registry_nodes schema requires owner_email, engine_url, and
 * node_number — all missing from the stub. Inserts with placeholder
 * values and metadata._stub=true so it can be located and replaced
 * once C2A registers through the live API.
 *
 * Idempotent: skips rows whose root_hash already exists.
 *
 * Run manually:
 *   node scripts/seed-existing-nodes.js
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env
 * (loads from .env.local if present).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var');
  console.error('Set them in .env.local or export them in your shell');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Load node JSONs ────────────────────────────────────────────
const node001 = JSON.parse(
  readFileSync(resolve(repoRoot, 'nodes/node-001-scout-signal.json'), 'utf-8'),
);
const node002 = JSON.parse(
  readFileSync(resolve(repoRoot, 'nodes/node-002-c2a-intelligence.json'), 'utf-8'),
);

// ── Build registry_nodes rows ──────────────────────────────────

// Node 001 — full record from repo
const row001 = {
  node_id: node001.node_id,
  display_name: node001.display_name,
  root_hash: node001.root_hash,
  current_hash: node001.current_hash,
  owner_email: node001.owner_email,
  engine_url: node001.engine_url,
  node_number: node001.node_number,
  node_class: node001.node_class || null,
  gate_holder: node001.gate_holder || null,
  seeking: node001.seeking || [],
  offering: node001.offering || [],
  hash_chain: node001.hash_chain || [],
  trust_state: 'confirmed',
  protocol_version: node001.protocol_version || 'kernel-api-v1',
  registered_at: node001.registered_at,
  last_state_at: node001.last_state_at || node001.registered_at,
  metadata: { seeded_from: 'nodes/node-001-scout-signal.json', seeded_at: new Date().toISOString() },
};

// Node 002 — STUB. Real data missing. Use placeholders, mark _stub=true.
// When C2A registers via the live API the seed row should be DELETED first.
// Placeholder root_hash is a deterministic string with the right shape but
// will not collide with a real registration (uses 'stub-' prefix collapsed).
const stubRootHash = 'stub' + '0'.repeat(60); // 64 chars, marked
const row002 = {
  node_id: node002.node_id,
  display_name: node002.display_name,
  root_hash: stubRootHash,
  current_hash: stubRootHash,
  owner_email: 'pending@c2asecurity.com',
  engine_url: 'https://pending',
  node_number: 2,
  node_class: 'enterprise',
  gate_holder: null,
  seeking: [],
  offering: [],
  hash_chain: [],
  trust_state: 'pending',
  protocol_version: 'kernel-api-v1',
  metadata: {
    _stub: true,
    seeded_from: 'nodes/node-002-c2a-intelligence.json',
    seeded_at: new Date().toISOString(),
    note: 'Placeholder. DELETE this row when C2A registers via POST /api/register.',
  },
};

// ── Insert (idempotent — skip if root_hash already exists) ─────
async function seedRow(label, row) {
  const { data: existing } = await supabase
    .from('registry_nodes')
    .select('id, root_hash, trust_state')
    .eq('root_hash', row.root_hash)
    .maybeSingle();

  if (existing) {
    console.log(`  ${label}: SKIP — root_hash ${row.root_hash.slice(0, 12)}… already present (id=${existing.id}, trust_state=${existing.trust_state})`);
    return existing;
  }

  const { data, error } = await supabase
    .from('registry_nodes')
    .insert(row)
    .select('id, root_hash, trust_state, node_id')
    .single();

  if (error) {
    console.error(`  ${label}: ERROR — ${error.message}`);
    return null;
  }
  console.log(`  ${label}: INSERTED — id=${data.id}, trust_state=${data.trust_state}, node_id=${data.node_id}`);
  return data;
}

console.log('Seeding registry_nodes from /nodes/...');
console.log('');
console.log('Node 001 (Scout Signal):');
const result001 = await seedRow('  node-001', row001);
console.log('');
console.log('Node 002 (C2A Intelligence — stub):');
const result002 = await seedRow('  node-002', row002);
console.log('');

// Log governance events for the seed action (idempotent — only if rows were freshly inserted)
async function logEvent(rootHash, eventType, eventData) {
  const { error } = await supabase.from('registry_governance_events').insert({
    node_root_hash: rootHash,
    event_type: eventType,
    event_data: eventData,
    changed_by: 'seed-script',
  });
  if (error) console.warn(`  event log failed: ${error.message}`);
}

if (result001 && !('_already' in result001)) {
  await logEvent(row001.root_hash, 'SEEDED', { source: 'nodes/node-001-scout-signal.json' });
}
if (result002 && !('_already' in result002)) {
  await logEvent(row002.root_hash, 'SEEDED_STUB', { source: 'nodes/node-002-c2a-intelligence.json' });
}

console.log('Done.');
