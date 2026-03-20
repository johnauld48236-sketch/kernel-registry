# Kernel Registry — Hash Specification

## Overview

Every Knowledge Node in the Kernel Registry is identified by a **root hash** — a SHA-256 digest generated at registration that never changes. Every state change produces a new **state hash** chained to the root. Any node in the network can verify another node's current state by replaying the chain from the root.

This is not a blockchain. There are no blocks, no consensus mechanism, no distributed ledger. This is a **hash chain** — a sequential, append-only record of state changes anchored to a permanent identity.

## Root Hash Generation

Generated once at registration. Immutable.

```
root_hash = SHA256(node_id + owner_email + registered_at + KERNEL_REGISTRY_SECRET)
```

| Component | Description |
|-----------|-------------|
| `node_id` | Unique identifier (e.g., `scout-signal-node-001`) |
| `owner_email` | Registrant's email address |
| `registered_at` | ISO 8601 timestamp of registration |
| `KERNEL_REGISTRY_SECRET` | Server-side secret, never exposed |

**Output**: 64-character lowercase hex string.

The root hash is the node's permanent address in the registry. All lookups, connections, and verifications reference this hash.

## State Hash Generation

Generated on every state change. Appended to the hash chain.

```
state_hash = SHA256(root_hash + shape_json + trust_state + confirmed_pct + state_timestamp)
```

| Component | Description |
|-----------|-------------|
| `root_hash` | The node's permanent root hash |
| `shape_json` | `JSON.stringify({ seeking, offering })` — current epistemic shape |
| `trust_state` | One of: `confirmed`, `claimed`, `seeking` |
| `confirmed_pct` | Integer 0–100 |
| `state_timestamp` | ISO 8601 timestamp of this state change |

**Output**: 64-character lowercase hex string.

## Hash Chain Structure

The hash chain is an ordered JSON array. Each entry records:

```json
{
  "hash": "<state_hash>",
  "timestamp": "<ISO 8601>",
  "action": "registration | state_update | connection | <custom>",
  "previous_hash": "<hash of the prior entry, absent on first entry>"
}
```

The first entry in the chain is always the registration event. Its `action` is `"registration"` and it has no `previous_hash`.

## Verification

To verify a node's current state:

1. Retrieve the node record by `root_hash`
2. Walk the `hash_chain` array from first to last
3. For each entry, recompute the state hash using the known root hash and the state values at that point
4. Confirm the final computed hash matches `current_hash`

If any hash in the chain does not match, the chain is broken and the node's state cannot be trusted.

## Security Properties

- **Root hash immutability**: The root hash is never overwritten. State updates create new chain entries.
- **Server secret**: `KERNEL_REGISTRY_SECRET` ensures root hashes cannot be pre-computed by external parties.
- **Append-only**: The hash chain only grows. Entries are never removed or modified.
- **Deterministic**: Given the same inputs, the same hash is always produced. This enables independent verification.

## Algorithm

- **Hash function**: SHA-256
- **Encoding**: Lowercase hexadecimal
- **String concatenation**: Direct concatenation, no separator
- **JSON serialization**: `JSON.stringify()` with default key ordering
- **Implementation**: Node.js `crypto.createHash('sha256')`
