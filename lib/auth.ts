import type { VercelRequest } from '@vercel/node';

/**
 * Validate Bearer token against KERNEL_REGISTRY_API_KEY env var.
 * Used to gate write endpoints (POST). Read endpoints (GET) are public.
 *
 * Returns true on a valid match. Returns false on missing header,
 * malformed header, or token mismatch.
 */
export function validateApiKey(request: VercelRequest): boolean {
  const apiKey = process.env.KERNEL_REGISTRY_API_KEY;
  if (!apiKey) return false;

  const header = request.headers['authorization'] || request.headers['Authorization' as never];
  if (!header || typeof header !== 'string') return false;

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const token = match[1].trim();
  // Constant-time-ish comparison: lengths first, then chars
  if (token.length !== apiKey.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ apiKey.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Get the registry secret used for root hash generation.
 * Throws if missing — registration cannot proceed without it.
 */
export function getRegistrySecret(): string {
  const secret = process.env.KERNEL_REGISTRY_SECRET;
  if (!secret) throw new Error('KERNEL_REGISTRY_SECRET not configured');
  return secret;
}
