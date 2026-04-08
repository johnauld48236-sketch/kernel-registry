import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../../lib/supabase.js';

/**
 * GET /api/nodes/:root_hash
 *
 * Public endpoint — no auth. Anyone can verify a node by its
 * root hash. Returns the public-facing fields only (no
 * gate_holder, no confirmed_by, no metadata).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const root_hash = (req.query.root_hash || '') as string;
  if (!root_hash || !/^[a-f0-9]{64}$/.test(root_hash)) {
    return res.status(400).json({ error: 'root_hash must be a 64-char lowercase hex string' });
  }

  try {
    const supabase = getServiceClient();

    const { data: node, error } = await supabase
      .from('registry_nodes')
      .select(`
        node_id,
        display_name,
        root_hash,
        current_hash,
        trust_state,
        governance_shape_hash,
        kpi_signatures,
        seeking,
        offering,
        registered_at,
        last_state_at,
        protocol_version
      `)
      .eq('root_hash', root_hash)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    return res.status(200).json({
      ...node,
      valid: node.trust_state === 'confirmed',
    });
  } catch (err) {
    console.error('[nodes GET]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
