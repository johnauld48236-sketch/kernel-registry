import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../lib/supabase.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * GET /api/governance-events
 *
 * Public timeline endpoint. No auth. Returns the registry's
 * append-only governance event log, newest-first.
 *
 * Query params:
 *   limit          (default 50, max 500)
 *   node_root_hash (optional filter — events touching this node)
 *   event_type     (optional filter — exact match)
 *
 * Response: { events: [...] }   (no total — caller pages by limit)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const nodeRootHash = req.query.node_root_hash ? String(req.query.node_root_hash) : null;
  const eventType = req.query.event_type ? String(req.query.event_type) : null;

  if (nodeRootHash && !/^[a-f0-9]{64}$/.test(nodeRootHash)) {
    return res.status(400).json({ error: 'node_root_hash must be a 64-char lowercase hex string' });
  }

  try {
    const supabase = getServiceClient();

    let query = supabase
      .from('registry_governance_events')
      .select('id, node_root_hash, connection_id, event_type, event_data, changed_by, changed_at')
      .order('changed_at', { ascending: false })
      .limit(limit);

    if (nodeRootHash) query = query.eq('node_root_hash', nodeRootHash);
    if (eventType) query = query.eq('event_type', eventType);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ events: data || [] });
  } catch (err) {
    console.error('[governance-events]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
