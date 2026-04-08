import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../../../lib/supabase.js';
import { validateApiKey } from '../../../lib/auth.js';
import { rejectIfAi } from '../../../lib/humans.js';

/**
 * PATCH /api/connections/:id/confirm
 *
 * Confirm a side of a pending connection. The body specifies which
 * node side is confirming via node_root_hash. When BOTH sides have
 * confirmed, state advances from PENDING to CONFIRMED and
 * authorized_at is stamped.
 *
 * Idempotent at every layer:
 *   • Repeating the same side returns the current state, no error.
 *   • A connection already CONFIRMED returns the current state, no-op.
 *   • A connection already REVOKED returns the current state, no-op.
 *
 * Body: { confirmed_by: string (human email), node_root_hash: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!validateApiKey(req)) {
    return res.status(401).json({ error: 'Missing or invalid Bearer token' });
  }

  const id = (req.query.id || '') as string;
  if (!id) {
    return res.status(400).json({ error: 'connection id is required' });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const confirmed_by = (body.confirmed_by || '') as string;
  const node_root_hash = (body.node_root_hash || '') as string;

  // Human-only guard
  const aiReason = rejectIfAi(confirmed_by);
  if (aiReason) return res.status(403).json({ error: `confirmed_by rejected: ${aiReason}` });

  if (!node_root_hash || !/^[a-f0-9]{64}$/.test(node_root_hash)) {
    return res.status(400).json({ error: 'node_root_hash must be a 64-char lowercase hex string' });
  }

  try {
    const supabase = getServiceClient();

    // Fetch the connection
    const { data: connection, error: readErr } = await supabase
      .from('registry_connections')
      .select('id, node_a_root_hash, node_b_root_hash, authorized_by_a, authorized_by_b, state, authorized_at, governance_shape_hash')
      .eq('id', id)
      .maybeSingle();

    if (readErr) return res.status(500).json({ error: readErr.message });
    if (!connection) return res.status(404).json({ error: 'Connection not found' });

    // Idempotent no-op for terminal states (already fully CONFIRMED or REVOKED)
    if (connection.state === 'CONFIRMED' || connection.state === 'REVOKED') {
      return res.status(200).json({
        connection_id: connection.id,
        state: connection.state,
        authorized_by_a: connection.authorized_by_a,
        authorized_by_b: connection.authorized_by_b,
        authorized_at: connection.authorized_at,
        message: `Connection is already ${connection.state} — no action taken`,
      });
    }

    // Determine which side this hash refers to
    let side: 'a' | 'b';
    if (node_root_hash === connection.node_a_root_hash) {
      side = 'a';
    } else if (node_root_hash === connection.node_b_root_hash) {
      side = 'b';
    } else {
      return res.status(400).json({
        error: 'node_root_hash does not match either node in this connection',
      });
    }

    // Re-check both nodes are still trust_state=confirmed
    const { data: nodeRows, error: nodeErr } = await supabase
      .from('registry_nodes')
      .select('root_hash, trust_state')
      .in('root_hash', [connection.node_a_root_hash, connection.node_b_root_hash]);

    if (nodeErr) return res.status(500).json({ error: nodeErr.message });
    if (!nodeRows || nodeRows.length !== 2) {
      return res.status(404).json({ error: 'One or both nodes are no longer present in the registry' });
    }
    const stillUnconfirmed = nodeRows.filter(n => n.trust_state !== 'confirmed');
    if (stillUnconfirmed.length > 0) {
      return res.status(403).json({
        error: 'Both nodes must still have trust_state=confirmed at confirmation time',
        unconfirmed: stillUnconfirmed.map(n => n.root_hash),
      });
    }

    // Idempotent — if this side is already authorized, return current state, no error
    const sideField = side === 'a' ? 'authorized_by_a' : 'authorized_by_b';
    const otherField = side === 'a' ? 'authorized_by_b' : 'authorized_by_a';
    const alreadyAuthorized = side === 'a' ? connection.authorized_by_a : connection.authorized_by_b;

    if (alreadyAuthorized) {
      return res.status(200).json({
        connection_id: connection.id,
        state: connection.state,
        authorized_by_a: connection.authorized_by_a,
        authorized_by_b: connection.authorized_by_b,
        authorized_at: connection.authorized_at,
        message: `Side ${side} already authorized by ${alreadyAuthorized} — no action taken`,
      });
    }

    // Compute the next state — both sides authorized after this update?
    const otherAuthorized = side === 'a' ? connection.authorized_by_b : connection.authorized_by_a;
    const willBeFullyConfirmed = !!otherAuthorized;
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      [sideField]: confirmed_by,
    };
    if (willBeFullyConfirmed) {
      updates.state = 'CONFIRMED';
      updates.authorized_at = now;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('registry_connections')
      .update(updates)
      .eq('id', id)
      .select('id, state, authorized_by_a, authorized_by_b, authorized_at')
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Log governance event
    if (willBeFullyConfirmed) {
      await supabase.from('registry_governance_events').insert({
        connection_id: connection.id,
        event_type: 'CONNECTION_CONFIRMED',
        event_data: {
          authorized_by_a: updated.authorized_by_a,
          authorized_by_b: updated.authorized_by_b,
          authorized_at: updated.authorized_at,
        },
        changed_by: confirmed_by,
      });
    } else {
      await supabase.from('registry_governance_events').insert({
        connection_id: connection.id,
        event_type: 'CONNECTION_SIDE_AUTHORIZED',
        event_data: {
          side,
          [otherField + '_pending']: true,
        },
        changed_by: confirmed_by,
      });
    }

    return res.status(200).json({
      connection_id: updated.id,
      state: updated.state,
      authorized_by_a: updated.authorized_by_a,
      authorized_by_b: updated.authorized_by_b,
      authorized_at: updated.authorized_at,
      message: willBeFullyConfirmed
        ? 'Connection fully confirmed by both sides'
        : `Side ${side} authorized — awaiting other side`,
    });
  } catch (err) {
    console.error('[connections/confirm PATCH]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
