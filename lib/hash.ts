import { createHash } from 'node:crypto';

/**
 * Compute the root hash for a node registration.
 *
 * Per schema/hash-spec.md:
 *   root_hash = SHA256(node_id + owner_email + registered_at + KERNEL_REGISTRY_SECRET)
 *
 * Direct concatenation, no separator. SHA-256 lowercase hex output.
 */
export function computeRootHash(
  node_id: string,
  owner_email: string,
  registered_at: string,
  secret: string,
): string {
  return createHash('sha256')
    .update(node_id + owner_email + registered_at + secret)
    .digest('hex');
}

/**
 * Compute a state hash for a state change event.
 *
 * Per schema/hash-spec.md:
 *   state_hash = SHA256(root_hash + shape_json + trust_state + confirmed_pct + state_timestamp)
 *
 * shape_json = JSON.stringify({ seeking, offering }) with default key ordering.
 */
export function computeStateHash(args: {
  root_hash: string;
  seeking: unknown[];
  offering: unknown[];
  trust_state: string;
  confirmed_pct: number;
  state_timestamp: string;
}): string {
  const shape_json = JSON.stringify({ seeking: args.seeking, offering: args.offering });
  return createHash('sha256')
    .update(args.root_hash + shape_json + args.trust_state + args.confirmed_pct + args.state_timestamp)
    .digest('hex');
}

/**
 * Compute a registration hash returned to clients on POST /api/register.
 *
 * Per spec body:
 *   registration_hash = SHA256(root_hash + "registration" + ISO_timestamp)
 */
export function computeRegistrationHash(root_hash: string, iso_timestamp: string): string {
  return createHash('sha256')
    .update(root_hash + 'registration' + iso_timestamp)
    .digest('hex');
}
