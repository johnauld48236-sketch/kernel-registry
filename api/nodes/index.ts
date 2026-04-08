import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCorsPreflight } from '../../lib/cors.js';
import { getServiceClient } from '../../lib/supabase.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/nodes
 *
 * Public list endpoint. No auth. Returns the public-facing fields
 * for every registered node, paged via limit/offset, optionally
 * filtered by trust_state. Excludes private fields (owner_email,
 * gate_holder, confirmed_by, metadata, hash_chain).
 *
 * Query params:
 *   limit       (default 50, max 200)
 *   offset      (default 0)
 *   trust_state (optional: pending | confirmed | revoked)
 *
 * Response: { nodes, total, limit, offset }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const offset = Math.max(parseInt(String(req.query.offset ?? 0), 10) || 0, 0);
  const trustState = req.query.trust_state ? String(req.query.trust_state) : null;

  if (trustState && !['pending', 'confirmed', 'revoked'].includes(trustState)) {
    return res.status(400).json({ error: 'trust_state must be one of: pending, confirmed, revoked' });
  }

  try {
    const supabase = getServiceClient();

    // Total count (separate query so total reflects the filter, not the page)
    let countQuery = supabase
      .from('registry_nodes')
      .select('id', { count: 'exact', head: true });
    if (trustState) countQuery = countQuery.eq('trust_state', trustState);

    const { count, error: countErr } = await countQuery;
    if (countErr) return res.status(500).json({ error: countErr.message });

    // Page query
    let pageQuery = supabase
      .from('registry_nodes')
      .select(`
        node_id,
        display_name,
        root_hash,
        trust_state,
        node_class,
        seeking,
        offering,
        registered_at,
        last_state_at
      `)
      .order('registered_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (trustState) pageQuery = pageQuery.eq('trust_state', trustState);

    const { data, error } = await pageQuery;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      nodes: data || [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[nodes list]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
