import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../../../lib/supabase.js';

/**
 * GET /api/connections/:id
 *
 * Public endpoint — no auth. Returns the full connection record.
 * Anyone can verify that a connection exists and what state it's in.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = (req.query.id || '') as string;
  if (!id) {
    return res.status(400).json({ error: 'connection id is required' });
  }

  try {
    const supabase = getServiceClient();

    const { data: connection, error } = await supabase
      .from('registry_connections')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!connection) return res.status(404).json({ error: 'Connection not found' });

    return res.status(200).json(connection);
  } catch (err) {
    console.error('[connections GET]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
