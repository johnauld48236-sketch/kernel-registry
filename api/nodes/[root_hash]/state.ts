import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../../../lib/supabase.js';
import { validateApiKey } from '../../../lib/auth.js';
import { computeStateHash } from '../../../lib/hash.js';
import { rejectIfAi } from '../../../lib/humans.js';

/**
 * POST /api/nodes/:root_hash/state
 *
 * Update a node's mutable state. Generates a new state_hash,
 * appends to hash_chain, updates current_hash, logs a
 * STATE_CHANGED event. changed_by must be a human email.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!validateApiKey(req)) {
    return res.status(401).json({ error: 'Missing or invalid Bearer token' });
  }

  const root_hash = (req.query.root_hash || '') as string;
  if (!root_hash || !/^[a-f0-9]{64}$/.test(root_hash)) {
    return res.status(400).json({ error: 'root_hash must be a 64-char lowercase hex string' });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const governance_shape_hash = (body.governance_shape_hash ?? null) as string | null;
  const kpi_signatures = Array.isArray(body.kpi_signatures) ? body.kpi_signatures : null;
  const changed_by = (body.changed_by || '') as string;

  // Human-only guard on changed_by
  const aiReason = rejectIfAi(changed_by);
  if (aiReason) return res.status(403).json({ error: `changed_by rejected: ${aiReason}` });

  try {
    const supabase = getServiceClient();

    // Fetch existing node
    const { data: existing, error: readErr } = await supabase
      .from('registry_nodes')
      .select('id, root_hash, current_hash, hash_chain, seeking, offering, trust_state, governance_shape_hash, kpi_signatures')
      .eq('root_hash', root_hash)
      .maybeSingle();

    if (readErr) return res.status(500).json({ error: readErr.message });
    if (!existing) return res.status(404).json({ error: 'Node not found' });

    const state_timestamp = new Date().toISOString();

    // Compute new state hash from CURRENT shape values (post-update)
    const next_governance_shape_hash = governance_shape_hash ?? existing.governance_shape_hash;
    const next_kpi_signatures = kpi_signatures ?? (existing.kpi_signatures as unknown[] | null) ?? [];
    const new_state_hash = computeStateHash({
      root_hash: existing.root_hash as string,
      seeking: (existing.seeking as unknown[]) || [],
      offering: (existing.offering as unknown[]) || [],
      trust_state: existing.trust_state as string,
      confirmed_pct: 0, // Not tracked on registry_nodes — kept at 0 for hash determinism
      state_timestamp,
    });

    // Append to hash_chain
    const prev_chain = (existing.hash_chain as Array<Record<string, unknown>> | null) || [];
    const next_chain = [
      ...prev_chain,
      {
        hash: new_state_hash,
        timestamp: state_timestamp,
        action: 'state_update',
        previous_hash: existing.current_hash,
      },
    ];

    const { error: updateErr } = await supabase
      .from('registry_nodes')
      .update({
        current_hash: new_state_hash,
        hash_chain: next_chain,
        governance_shape_hash: next_governance_shape_hash,
        kpi_signatures: next_kpi_signatures,
        last_state_at: state_timestamp,
      })
      .eq('root_hash', root_hash);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Log STATE_CHANGED event (append-only)
    await supabase.from('registry_governance_events').insert({
      node_root_hash: root_hash,
      event_type: 'STATE_CHANGED',
      event_data: {
        previous_hash: existing.current_hash,
        new_hash: new_state_hash,
        governance_shape_hash: next_governance_shape_hash,
        kpi_signature_count: next_kpi_signatures.length,
      },
      changed_by,
    });

    return res.status(200).json({
      root_hash,
      current_hash: new_state_hash,
      previous_hash: existing.current_hash,
      governance_shape_hash: next_governance_shape_hash,
      kpi_signatures: next_kpi_signatures,
      last_state_at: state_timestamp,
    });
  } catch (err) {
    console.error('[nodes/state POST]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
