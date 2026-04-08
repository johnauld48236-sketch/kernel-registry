-- fix-node-002.sql
-- Spec: kernel-registry-api-v1 (3165e1c3) — follow-up data fix
--
-- Updates the Node 002 (C2A Intelligence) seed row from its
-- placeholder values (created by scripts/seed-existing-nodes.js)
-- to the real C2A registration data.
--
-- The seed script inserted Node 002 as a stub because the file
-- nodes/node-002-c2a-intelligence.json in the repo had only 6
-- fields and was missing owner_email, engine_url, etc. This
-- script promotes it to a real confirmed registration so it can
-- participate in the Scout Signal ↔ C2A connection handshake.
--
-- WHERE clause matches by node_id (the canonical natural key
-- on the seed row) so this is idempotent and safe to re-run.
--
-- Run manually in Supabase SQL editor against the kernel-registry
-- project (sjnxapgnjbogxcgcrpui).

UPDATE registry_nodes
SET
  root_hash = '0facf09b5ad17540cebf1f57ab23ffc9f54cc94a887ca6e1817c491b1b8507a5',
  current_hash = '7e0769f8c2d90edae1e2c89e73d72ccbceb4484c5ababb9e8e1debc1d0df4c91',
  owner_email = 'john@scoutsignal.ai',
  engine_url = 'https://c2a-intelligence-graph.vercel.app',
  node_number = 2,
  node_class = 'enterprise',
  gate_holder = 'john@scoutsignal.ai',
  trust_state = 'confirmed',
  seeking = '["CVE intelligence CVSS > 7.0","regulatory updates (ISO 21434, UN WP.29, MDR, FDA 510k)","SBOM and component vulnerability data"]'::jsonb,
  offering = '["CVE intelligence routing — governed MDM to HDO channel (Signal Bridge)","SBOM-correlated exploitability scoring","EVSec governed pipeline — ISO/SAE 21434 TARA data shape"]'::jsonb
WHERE node_id = 'c2a-intelligence-node-002';
