# Kernel Registry

The governed identity protocol for Knowledge Nodes.

## What This Is

The Kernel Registry is an open protocol for registering, tracking, and verifying Knowledge Nodes — systems that produce, process, or consume knowledge. Every node that registers receives a **root hash**, a permanent SHA-256 identity. Every state change chains to that root. Any node in the network can verify another node's current state against its root hash.

This is not a blockchain. It's an epistemic state registry. We track what a node knows, what it has confirmed, what it's seeking, and whether its outputs can be trusted.

## Node 001

Scout Signal is the first registered node.

```
root_hash: 68b7bebc8caecc2c0a5de1e076f9d0599b4a6acc80bc07709bb33a05f1173055
```

See [`nodes/node-001-scout-signal.json`](nodes/node-001-scout-signal.json) for the full confirmed registration record.

## Repository Structure

```
/schema
  node-registration.json    — Registration record JSON Schema
  state-update.json         — State change record JSON Schema
  connection-handshake.json — Node connection protocol JSON Schema
  hash-spec.md              — How root and state hashes are generated

/protocol
  PROTOCOL.md               — Full protocol specification
  CONTRIBUTING.md            — How to register a node

/nodes
  node-001-scout-signal.json     — Scout Signal (confirmed)
  node-002-c2a-intelligence.json — C2A Intelligence (stub, pending registration)
```

## Register a Node

See [CONTRIBUTING.md](protocol/CONTRIBUTING.md) for the full registration process.

Short version:

1. POST your registration to the hosted endpoint
2. Save the root hash from the response
3. Add your confirmed registration JSON to `/nodes/`
4. Open a PR

## Protocol Version

Current: `kernel-api-v1`

## License

MIT
