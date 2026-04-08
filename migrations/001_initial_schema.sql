-- 001_initial_schema.sql
-- Spec: kernel-registry-api-v1 (3165e1c3)
--
-- Three tables for the Kernel Registry v1 API:
--   • registry_nodes              — registered Knowledge Nodes
--   • registry_connections        — governed connections between nodes
--   • registry_governance_events  — append-only audit chain
--
-- Notes:
--   • trust_state uses ADMINISTRATIVE vocab (pending/confirmed/revoked),
--     not the protocol's epistemic vocab (confirmed/claimed/seeking).
--     The protocol docs (PROTOCOL.md, hash-spec.md, node-001 JSON) use
--     the epistemic vocab — those are tracked separately and Node 001's
--     pre-existing trust_state="confirmed" happens to coincide with the
--     administrative "confirmed" by accident. Worth noting in any future
--     protocol-doc-sync spec.
--   • root_hash is the natural key for cross-table references (instead
--     of the surrogate uuid id). It's UNIQUE on registry_nodes and the
--     foreign keys on registry_connections reference it directly.
--   • registry_governance_events is append-only — no updates, no deletes.
--     RLS will be added in a follow-up if/when this DB grows multi-tenant.
--
-- Run manually in Supabase SQL editor against the new dedicated
-- Kernel Registry project (sjnxapgnjbogxcgcrpui).

BEGIN;

-- ── registry_nodes ──────────────────────────────────────────
CREATE TABLE registry_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id text NOT NULL UNIQUE,
  display_name text NOT NULL,
  root_hash text NOT NULL UNIQUE,
  current_hash text NOT NULL,
  owner_email text NOT NULL,
  engine_url text NOT NULL,
  node_number int NOT NULL,
  node_class text,
  gate_holder text,
  seeking jsonb DEFAULT '[]',
  offering jsonb DEFAULT '[]',
  governance_shape_hash text,
  kpi_signatures jsonb DEFAULT '[]',
  trust_state text NOT NULL DEFAULT 'pending'
    CHECK (trust_state IN ('pending', 'confirmed', 'revoked')),
  confirmed_by text,
  hash_chain jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  registered_at timestamptz DEFAULT now(),
  last_state_at timestamptz DEFAULT now(),
  protocol_version text DEFAULT 'kernel-api-v1'
);

CREATE INDEX idx_registry_nodes_trust_state ON registry_nodes(trust_state);
CREATE INDEX idx_registry_nodes_node_id ON registry_nodes(node_id);

-- ── registry_connections ────────────────────────────────────
CREATE TABLE registry_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_a_root_hash text NOT NULL REFERENCES registry_nodes(root_hash),
  node_b_root_hash text NOT NULL REFERENCES registry_nodes(root_hash),
  shared_kpi_signatures jsonb DEFAULT '[]',
  authorized_by_a text,
  authorized_by_b text,
  governance_shape_hash text,
  state text NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING', 'CONFIRMED', 'REVOKED')),
  authorized_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_registry_connections_node_a ON registry_connections(node_a_root_hash);
CREATE INDEX idx_registry_connections_node_b ON registry_connections(node_b_root_hash);
CREATE INDEX idx_registry_connections_state ON registry_connections(state);

-- ── registry_governance_events (append-only) ────────────────
CREATE TABLE registry_governance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_root_hash text,
  connection_id uuid,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  changed_by text NOT NULL,
  changed_at timestamptz DEFAULT now()
);

CREATE INDEX idx_registry_events_node ON registry_governance_events(node_root_hash);
CREATE INDEX idx_registry_events_connection ON registry_governance_events(connection_id);
CREATE INDEX idx_registry_events_type ON registry_governance_events(event_type);

COMMIT;
