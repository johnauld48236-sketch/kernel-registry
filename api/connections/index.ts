import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../../lib/supabase.js';
import { validateApiKey } from '../../lib/auth.js';
import { rejectIfAi } from '../../lib/humans.js';

/**
 * POST /api/connections
 *
 * Initiate a governed connection between two confirmed nodes.
 * Both nodes must exist and have trust_state='confirmed'.
 * requested_by must be a human email. Returns connection_id
 * and state='PENDING' — both nodes' gate holders must
 * authorize separately to advance to CONFIRMED.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!validateApiKey(req)) {
    return res.status(401).json({ error: 'Missing or invalid Bearer token' });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const node_a_root_hash = (body.node_a_root_hash || '') as string;
  const node_b_root_hash = (body.node_b_root_hash || '') as string;
  const shared_kpi_signatures = Array.isArray(body.shared_kpi_signatures) ? body.shared_kpi_signatures : [];
  const requested_by = (body.requested_by || '') as string;

  if (!node_a_root_hash || !/^[a-f0-9]{64}$/.test(node_a_root_hash)) {
    return res.status(400).json({ error: 'node_a_root_hash must be a 64-char lowercase hex string' });
  }
  if (!node_b_root_hash || !/^[a-f0-9]{64}$/.test(node_b_root_hash)) {
    return res.status(400).json({ error: 'node_b_root_hash must be a 64-char lowercase hex string' });
  }
  if (node_a_root_hash === node_b_root_hash) {
    return res.status(400).json({ error: 'node_a and node_b must be distinct' });
  }

  const aiReason = rejectIfAi(requested_by);
  if (aiReason) return res.status(403).json({ error: `requested_by rejected: ${aiReason}` });

  try {
    const supabase = getServiceClient();

    // Both nodes must exist and be confirmed
    const { data: nodes, error: nodeErr } = await supabase
      .from('registry_nodes')
      .select('root_hash, trust_state')
      .in('root_hash', [node_a_root_hash, node_b_root_hash]);

    if (nodeErr) return res.status(500).json({ error: nodeErr.message });
    if (!nodes || nodes.length !== 2) {
      return res.status(404).json({ error: 'Both node_a and node_b must exist in the registry' });
    }
    const unconfirmed = nodes.filter(n => n.trust_state !== 'confirmed');
    if (unconfirmed.length > 0) {
      return res.status(403).json({
        error: 'Both nodes must have trust_state=confirmed before they can connect',
        unconfirmed: unconfirmed.map(n => n.root_hash),
      });
    }

    const { data: connection, error: insertErr } = await supabase
      .from('registry_connections')
      .insert({
        node_a_root_hash,
        node_b_root_hash,
        shared_kpi_signatures,
        state: 'PENDING',
      })
      .select('id, state, created_at')
      .single();

    if (insertErr) return res.status(500).json({ error: insertErr.message });

    // Log connection event
    await supabase.from('registry_governance_events').insert({
      connection_id: connection.id,
      event_type: 'CONNECTION_REQUESTED',
      event_data: {
        node_a_root_hash,
        node_b_root_hash,
        shared_kpi_signature_count: shared_kpi_signatures.length,
      },
      changed_by: requested_by,
    });

    return res.status(201).json({
      connection_id: connection.id,
      state: 'PENDING',
      created_at: connection.created_at,
      message: 'Connection pending confirmation from both nodes',
    });
  } catch (err) {
    console.error('[connections POST]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
