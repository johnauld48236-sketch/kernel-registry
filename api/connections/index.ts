import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../../lib/supabase.js';
import { validateApiKey } from '../../lib/auth.js';
import { rejectIfAi } from '../../lib/humans.js';

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

/**
 * /api/connections
 *
 *   GET  → public list of connections with both-side display names
 *          query: limit, offset, state
 *          response: { connections, total, limit, offset }
 *
 *   POST → initiate a governed connection between two confirmed
 *          nodes. Bearer-auth required. requested_by must be a
 *          human email. Returns connection_id and state='PENDING'.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handlePost(req, res);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

// ── GET — public list ─────────────────────────────────────────
async function handleList(req: VercelRequest, res: VercelResponse) {
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? LIST_DEFAULT_LIMIT), 10) || LIST_DEFAULT_LIMIT, 1),
    LIST_MAX_LIMIT,
  );
  const offset = Math.max(parseInt(String(req.query.offset ?? 0), 10) || 0, 0);
  const state = req.query.state ? String(req.query.state) : null;

  if (state && !['PENDING', 'CONFIRMED', 'REVOKED'].includes(state)) {
    return res.status(400).json({ error: 'state must be one of: PENDING, CONFIRMED, REVOKED' });
  }

  try {
    const supabase = getServiceClient();

    // Total count (filtered)
    let countQuery = supabase
      .from('registry_connections')
      .select('id', { count: 'exact', head: true });
    if (state) countQuery = countQuery.eq('state', state);

    const { count, error: countErr } = await countQuery;
    if (countErr) return res.status(500).json({ error: countErr.message });

    // Page query
    let pageQuery = supabase
      .from('registry_connections')
      .select(`
        id,
        node_a_root_hash,
        node_b_root_hash,
        shared_kpi_signatures,
        authorized_by_a,
        authorized_by_b,
        authorized_at,
        state,
        created_at
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (state) pageQuery = pageQuery.eq('state', state);

    const { data: rows, error } = await pageQuery;
    if (error) return res.status(500).json({ error: error.message });

    // Stitch in display names for both sides via a single follow-up query
    const allHashes = new Set<string>();
    for (const row of rows || []) {
      if (row.node_a_root_hash) allHashes.add(row.node_a_root_hash as string);
      if (row.node_b_root_hash) allHashes.add(row.node_b_root_hash as string);
    }

    const nodeMap = new Map<string, { node_id: string; display_name: string; root_hash: string }>();
    if (allHashes.size > 0) {
      const { data: nodeRows, error: nodeErr } = await supabase
        .from('registry_nodes')
        .select('node_id, display_name, root_hash')
        .in('root_hash', Array.from(allHashes));
      if (nodeErr) return res.status(500).json({ error: nodeErr.message });
      for (const n of nodeRows || []) {
        nodeMap.set(n.root_hash as string, {
          node_id: n.node_id as string,
          display_name: n.display_name as string,
          root_hash: n.root_hash as string,
        });
      }
    }

    const connections = (rows || []).map(row => ({
      connection_id: row.id,
      node_a: nodeMap.get(row.node_a_root_hash as string) || {
        node_id: null,
        display_name: '(unknown)',
        root_hash: row.node_a_root_hash,
      },
      node_b: nodeMap.get(row.node_b_root_hash as string) || {
        node_id: null,
        display_name: '(unknown)',
        root_hash: row.node_b_root_hash,
      },
      state: row.state,
      shared_kpi_signatures: row.shared_kpi_signatures || [],
      authorized_by_a: row.authorized_by_a,
      authorized_by_b: row.authorized_by_b,
      authorized_at: row.authorized_at,
      created_at: row.created_at,
    }));

    return res.status(200).json({
      connections,
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[connections list]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}

// ── POST — initiate connection ────────────────────────────────
async function handlePost(req: VercelRequest, res: VercelResponse) {
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
