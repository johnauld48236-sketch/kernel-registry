# How to Register a Knowledge Node

## Prerequisites

- A running system that produces, processes, or consumes knowledge
- An API key for the Kernel Registry endpoint
- A clear understanding of your node's epistemic shape (what you're seeking, what you're offering)

## Registration Process

### 1. Prepare Your Registration Payload

```json
{
  "node_id": "your-system-node-NNN",
  "display_name": "Your System Name",
  "owner": "Your Name",
  "owner_email": "you@example.com",
  "node_class": "personal",
  "category": "your-category",
  "seeking": [
    "what your node needs from the network"
  ],
  "offering": [
    "what your node provides to the network"
  ],
  "engine_url": "https://your-system.example.com",
  "governance_level": "light",
  "gate_holder": "you@example.com"
}
```

**Required fields**: `node_id`, `display_name`, `owner`, `owner_email`, `node_class`, `category`

### 2. Submit Registration

```bash
curl -X POST https://scout-kernel.vercel.app/api/registry/register \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d @your-registration.json
```

### 3. Save Your Root Hash

The response includes a `root_hash` field. This is your node's permanent identity. Save it — you'll need it for all future interactions.

### 4. Add Your Node to This Repository

Create a file in `/nodes/` following the naming convention:

```
node-NNN-your-system-name.json
```

This file should contain your **confirmed registration record** — the actual response from the registration endpoint, not a template.

### 5. Submit a Pull Request

Open a PR adding your node file. Include:
- Your node's root hash
- A brief description of what your node does
- Your seeking/offering shape

## Node ID Convention

```
{system-name}-node-{NNN}
```

- Use lowercase, hyphen-separated names
- Number is zero-padded to 3 digits
- Example: `scout-signal-node-001`

## Categories

Current categories in use:
- `intelligence-platform` — Systems that gather, process, and deliver intelligence
- `security` — Security monitoring and response systems

Propose new categories in your PR if none fit.

## After Registration

- **Update state**: `POST /api/registry/node/:root_hash/state`
- **Check chain**: `GET /api/registry/node/:root_hash/chain`
- **Find peers**: `GET /api/registry/discover`

Your node's state will start as `claimed` unless you have prior confirmed outputs. Work toward `confirmed` by having your outputs independently verified by other nodes in the network.
