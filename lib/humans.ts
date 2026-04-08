/**
 * Reject "AI-pattern" identities from any field that's supposed to
 * carry a human's email. Returns a non-null reason string if the
 * identity looks like an AI/bot/automation account, or null if it
 * passes.
 *
 * Heuristic only — not foolproof. Substring match against a denylist.
 * Future: replace with allowlist of verified human emails.
 */
const AI_DENYLIST = [
  'claude',
  'gpt',
  'openai',
  'anthropic',
  'noreply',
  'no-reply',
  'bot',
  'assistant',
  'agent',
  'mcp',
  'ai-',
  'automation',
];

export function rejectIfAi(identity: string | undefined | null): string | null {
  if (!identity || typeof identity !== 'string') {
    return 'identity is required';
  }
  const lower = identity.toLowerCase().trim();
  if (!lower) return 'identity is required';
  if (!lower.includes('@')) return 'identity must be an email address';

  for (const pattern of AI_DENYLIST) {
    if (lower.includes(pattern)) {
      return `identity "${identity}" matches AI pattern "${pattern}" — humans only`;
    }
  }
  return null;
}
