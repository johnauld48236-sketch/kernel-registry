import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCorsPreflight } from '../lib/cors.js';
import { getServiceClient } from '../lib/supabase.js';
import { validateApiKey, getRegistrySecret } from '../lib/auth.js';
import { computeRootHash, computeRegistrationHash } from '../lib/hash.js';
import { rejectIfAi } from '../lib/humans.js';

/**
 * POST /api/register
 *
 * Register a new Knowledge Node. Generates root_hash and
 * registration_hash, inserts the row with trust_state='pending',
 * logs a REGISTERED event. Returns the hashes and a "pending
 * human confirmation" message — confirmed_by cannot be set here.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!validateApiKey(req)) {
    return res.status(401).json({ error: 'Missing or invalid Bearer token' });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const node_id = (body.node_id || '') as string;
  const display_name = (body.display_name || '') as string;
  const owner_email = (body.owner_email || '') as string;
  const engine_url = (body.engine_url || '') as string;
  const node_number = body.node_number as number | undefined;
  const node_class = (body.node_class || null) as string | null;
  const seeking = Array.isArray(body.seeking) ? body.seeking : [];
  const offering = Array.isArray(body.offering) ? body.offering : [];
  const gate_holder = (body.gate_holder || '') as string;
  const protocol_version = (body.protocol_version || 'kernel-api-v1') as string;

  // Validation
  if (!node_id) return res.status(400).json({ error: 'node_id is required' });
  if (!display_name) return res.status(400).json({ error: 'display_name is required' });
  if (!owner_email) return res.status(400).json({ error: 'owner_email is required' });
  if (!engine_url) return res.status(400).json({ error: 'engine_url is required' });
  if (typeof node_number !== 'number' || !Number.isInteger(node_number) || node_number < 1) {
    return res.status(400).json({ error: 'node_number is required (positive integer)' });
  }
  if (!gate_holder) return res.status(400).json({ error: 'gate_holder is required' });

  // Spec guard: confirmed_by cannot be set on registration
  if ('confirmed_by' in body) {
    return res.status(400).json({ error: 'confirmed_by cannot be set on registration — that is a separate human action' });
  }

  // Gate holder must look human
  const aiReason = rejectIfAi(gate_holder);
  if (aiReason) return res.status(403).json({ error: `gate_holder rejected: ${aiReason}` });

  let secret: string;
  try {
    secret = getRegistrySecret();
  } catch (err) {
    return res.status(503).json({ error: err instanceof Error ? err.message : 'Registry not configured' });
  }

  const registered_at = new Date().toISOString();
  const root_hash = computeRootHash(node_id, owner_email, registered_at, secret);
  const registration_hash = computeRegistrationHash(root_hash, registered_at);

  const hash_chain = [{
    hash: registration_hash,
    timestamp: registered_at,
    action: 'registration',
  }];

  try {
    const supabase = getServiceClient();

    const { data: node, error: insertErr } = await supabase
      .from('registry_nodes')
      .insert({
        node_id,
        display_name,
        root_hash,
        current_hash: registration_hash,
        owner_email,
        engine_url,
        node_number,
        node_class,
        gate_holder,
        seeking,
        offering,
        hash_chain,
        trust_state: 'pending',
        protocol_version,
        registered_at,
        last_state_at: registered_at,
      })
      .select('id, root_hash, node_id, registered_at')
      .single();

    if (insertErr) {
      // Likely UNIQUE violation on node_id or root_hash
      const code = insertErr.code === '23505' ? 409 : 500;
      return res.status(code).json({ error: insertErr.message });
    }

    // Log REGISTERED event
    await supabase.from('registry_governance_events').insert({
      node_root_hash: root_hash,
      event_type: 'REGISTERED',
      event_data: {
        node_id,
        display_name,
        node_number,
        engine_url,
      },
      changed_by: gate_holder,
    });

    return res.status(201).json({
      root_hash,
      registration_hash,
      node_id,
      registered_at: node.registered_at,
      message: 'Registration pending human confirmation',
    });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
