# Kernel Registry Protocol — v1

## What This Is

The Kernel Registry is a governed identity protocol for Knowledge Nodes. It provides:

1. **Registration** — A node registers and receives a root hash, its permanent identity.
2. **State tracking** — Every change to a node's state produces a new hash chained to the root.
3. **Verification** — Any node can verify another node's current state against its root hash.
4. **Discovery** — Nodes find each other by matching epistemic shape (seeking/offering).

This is not a blockchain. There is no consensus mechanism, no distributed ledger. It is an **epistemic state registry** — tracking what a node knows, what it has confirmed, what it's seeking, and whether its outputs can be trusted.

## Core Concepts

### Knowledge Node

A Knowledge Node is any system that produces, processes, or consumes knowledge. It could be:
- An intelligence platform (like Scout Signal)
- A security monitoring system
- A research tool
- An enterprise knowledge base

Each node has a **shape** — what it's seeking and what it's offering — and a **trust state** — whether its outputs have been independently confirmed.

### Root Hash

The root hash is a SHA-256 digest generated at registration:

```
root_hash = SHA256(node_id + owner_email + registered_at + KERNEL_REGISTRY_SECRET)
```

It never changes. It is the node's permanent address in the registry. All lookups, connections, and verifications reference this hash.

### Hash Chain

Every state change produces a state hash:

```
state_hash = SHA256(root_hash + shape_json + trust_state + confirmed_pct + state_timestamp)
```

State hashes are appended to an ordered chain. The chain is append-only — entries are never removed or modified. The most recent hash is the `current_hash`.

### Trust States

| State | Meaning |
|-------|---------|
| `confirmed` | Outputs have been independently verified |
| `claimed` | Outputs exist but are not yet verified |
| `seeking` | Node is actively seeking inputs, not yet producing |

### Node Classes

| Class | Meaning |
|-------|---------|
| `personal` | Operated by an individual |
| `enterprise` | Operated by an organization |

### Governance Levels

| Level | Meaning |
|-------|---------|
| `light` | Minimal human gates |
| `standard` | Standard confirmation gates |
| `heavy` | Strict human confirmation required |

## API Endpoints

### Register a Node

```
POST /api/registry/register
```

Required fields: `node_id`, `display_name`, `owner`, `owner_email`, `node_class`, `category`

Returns the full registration record including `root_hash`.

### Look Up a Node

```
GET /api/registry/node/:root_hash
```

Returns the current state of a registered node.

### Get Hash Chain

```
GET /api/registry/node/:root_hash/chain
```

Returns the full state history — every hash, timestamp, and action.

### Update State

```
POST /api/registry/node/:root_hash/state
```

Accepts any combination of mutable fields (`seeking`, `offering`, `trust_state`, `confirmed_pct`, `reputation`, `connections`, etc.). Generates a new state hash, appends to chain.

The `root_hash` is never modified by a state update.

### Discover Nodes

```
GET /api/registry/discover
```

Query parameters: `category`, `trust_state`, `node_class`, `seeking`, `offering`, `limit`, `offset`

Returns nodes matching the query. Shape matching checks for exact string matches within the seeking/offering arrays.

## Authentication

All endpoints require an `x-api-key` header with a valid API key.

## Connection Handshake

Two nodes connect by:

1. **Initiation** — Node A sends a connection request referencing Node B's root hash
2. **Chain verification** — Both nodes verify each other's hash chain integrity
3. **Confirmation** — If both chains verify, the connection is confirmed and both nodes add each other's root hash to their `connections` array

Connection state changes produce new hash chain entries on both nodes.

## Protocol Version

Current version: `kernel-api-v1`

All records include a `protocol_version` field to ensure forward compatibility.
