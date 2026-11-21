export interface ConversationTurnInput {
  role: string;
  text: string;
}

const ASSISTANT_BOILERPLATE_PATTERNS: RegExp[] = [
  /^\.\.\.$/,
  /\bmain yahin hoon\b/i,
  /\bmain sun raha hoon\b/i,
  /\bmain active hoon\b/i,
  /\bmain standby par ja raha hoon\b/i,
  /\bmain haazir ho jaunga\b/i,
  /\bi am listening whenever you want to say something\b/i,
  /\bgoing on standby\b/i,
  /\bready whenever you want\b/i,
  /\bcouldn't reach the answer service\b/i,
  /\brukawat aayi\b/i,
  /\bunable to generate response\b/i,
];

function isPureAssistantBoilerplate(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '...') return true;
  if (
    /\bcouldn't reach the answer service\b|\brukawat aayi\b|\bunable to generate response\b/i.test(
      trimmed
    )
  ) {
    return true;
  }
  // Short standby/presence/greeting turns that carry no factual answer
  if (trimmed.length <= 180 && ASSISTANT_BOILERPLATE_PATTERNS.some((p) => p.test(trimmed))) {
    return true;
  }
  return false;
}

/**
 * Filters recent conversation turns before sending context to the conversational brain.
 * Crucially, valid user questions are NEVER discarded by assistant-boilerplate filters—only
 * empty placeholders and assistant standby/error/presence filler turns are removed.
 */
export function filterRecentConversationTurns<T extends ConversationTurnInput>(
  turns: T[] | undefined | null,
  limit = 4
): Array<{ role: 'user' | 'assistant'; text: string }> {
  if (!Array.isArray(turns)) return [];

  const cleaned: Array<{ role: 'user' | 'assistant'; text: string }> = [];

  for (const turn of turns) {
    if (!turn || typeof turn.text !== 'string') continue;
    const trimmed = turn.text.trim();
    if (!trimmed || trimmed === '...') continue;

    const normalizedRole: 'user' | 'assistant' =
      turn.role === 'user' ? 'user' : 'assistant';

    if (normalizedRole === 'assistant' && isPureAssistantBoilerplate(trimmed)) {
      continue;
    }

    cleaned.push({ role: normalizedRole, text: trimmed });
  }

  return cleaned.slice(-Math.max(1, limit));
}
