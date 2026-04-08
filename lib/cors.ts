import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Apply permissive CORS headers to a response.
 *
 * Access-Control-Allow-Origin: *
 *   The Kernel Registry is a public verification service. Any
 *   website can call the read endpoints to verify a node's state.
 *   Write endpoints are still gated by the Bearer token.
 *
 * Allow-Methods includes every verb the registry currently uses
 * (GET / POST / PATCH) plus OPTIONS for preflight.
 *
 * Allow-Headers includes Authorization (for Bearer auth on writes)
 * and Content-Type (for JSON bodies). These are the two custom
 * headers the audit console and any direct client will send.
 */
export function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Handle a CORS preflight request. Call at the very top of every
 * handler:
 *
 *   if (handleCorsPreflight(req, res)) return;
 *
 * Always sets the CORS headers on the response. If the incoming
 * request is an OPTIONS preflight, responds 200 immediately and
 * returns true so the caller can short-circuit. Returns false on
 * non-OPTIONS requests so the caller continues with normal handling.
 */
export function handleCorsPreflight(req: VercelRequest, res: VercelResponse): boolean {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
