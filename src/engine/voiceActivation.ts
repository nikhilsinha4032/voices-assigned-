export type VoiceActivationAction =
  | { type: 'activate'; command: string }
  | { type: 'deactivate' }
  | { type: 'command'; command: string }
  | { type: 'ignore' };

const DEACTIVATE_PATTERNS = [
  /^(?:ok\s+|okay\s+|please\s+)?(?:deactivate|sleep|go to sleep|standby|go standby|stop listening|mute mic|power off|shut down)\b/i,
  /^(?:band ho jao|band karo|so jao|chup ho jao|ruk jao|bas karo|off ho jao)\b/i,
  /^(?:bye|good\s*bye|alvida|see you)\b/i,
];

const GREETING_PREFIXES = new Set([
  'hey',
  'ok',
  'okay',
  'hi',
  'hello',
  'suno',
  'oye',
  'listen',
  'yo',
  'please',
  'अरे',
  'सुनो',
  'हे',
  'हेलो',
]);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNameVariants(assistantName: string): string[] {
  const clean = assistantName.trim().toLowerCase() || 'jarvis';
  const variants = new Set<string>([clean]);
  if (clean === 'jarvis') {
    [
      'jarvish',
      'jarves',
      'jarwis',
      'jarviz',
      'jervis',
      'garvis',
      'charvis',
      'javis',
      'jaavis',
      'jarvi',
      'jarbus',
      'jarbas',
      'jarbis',
      'zarvis',
      'jharvis',
      'jarvees',
      'jarvesh',
      'जार्विस',
      'जारविस',
      'जर्विस',
      'जर्विश',
      'जरविस',
      'जॉर्विस',
      'जार्विश',
      'जाविस',
      'जार्वीस',
      'जरवीस',
    ].forEach((v) => variants.add(v));
  }
  return Array.from(variants);
}

function normalizePhonetic(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z\u0900-\u097f0-9]/g, '')
    .replace(/ph/g, 'f')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/sh/g, 's')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/(.)\1+/g, '$1');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function firstCharCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a[0] === b[0]) return true;
  const softJ = new Set(['j', 'g', 'z', 'c', 'ज']);
  if (softJ.has(a[0]) && softJ.has(b[0])) return true;
  const vowelA = /^[aeiou]/.test(a);
  const vowelB = /^[aeiou]/.test(b);
  return vowelA && vowelB;
}

function isFuzzyWakeToken(candidateRaw: string, targetNames: string[], hasGreetingPrefix: boolean): boolean {
  const cleanCand = candidateRaw.toLowerCase().replace(/^[^a-z\u0900-\u097f0-9]+|[^a-z\u0900-\u097f0-9]+$/g, '');
  if (cleanCand.length < 3) return false;

  if (targetNames.includes('jarvis') && hasGreetingPrefix && cleanCand === 'service') {
    return true;
  }

  const candPhonetic = normalizePhonetic(cleanCand);
  for (const target of targetNames) {
    if (cleanCand === target) return true;
    const targetPhonetic = normalizePhonetic(target);
    if (!targetPhonetic || targetPhonetic.length < 4) continue;
    if (candPhonetic === targetPhonetic) return true;

    // Require minimum length ratio so tiny words like "is" or "it" never fuzzy-match
    if (candPhonetic.length < Math.max(4, targetPhonetic.length - 2)) continue;

    const dist = levenshtein(candPhonetic, targetPhonetic);
    const maxLen = Math.max(candPhonetic.length, targetPhonetic.length);
    const maxAllowed = targetPhonetic.length >= 6 ? 2 : 1;

    if (dist <= maxAllowed && firstCharCompatible(candPhonetic, targetPhonetic) && dist / maxLen <= 0.36) {
      return true;
    }
  }
  return false;
}

function findFuzzyWakeCommand(text: string, assistantName: string): string | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const variants = buildNameVariants(assistantName);

  for (let i = 0; i < tokens.length; i++) {
    const prevClean = i > 0 ? tokens[i - 1].toLowerCase().replace(/[^a-z\u0900-\u097f]/g, '') : '';
    const hasGreetingPrefix = GREETING_PREFIXES.has(prevClean);

    // 1. Single-token fuzzy match (e.g., "garvis ...", "aayushi ...", "hey service ...")
    if (isFuzzyWakeToken(tokens[i], variants, hasGreetingPrefix)) {
      const startSlice = hasGreetingPrefix ? i - 1 : i;
      const before = tokens.slice(0, startSlice);
      const after = tokens.slice(i + 1);
      return [...before, ...after].join(' ').replace(/^[,:\s]+/, '').trim();
    }

    // 2. Two-word split wake recognition (e.g., "jar vis", "jaar wish", "aayu shi")
    if (i + 1 < tokens.length) {
      const joined = `${tokens[i]}${tokens[i + 1]}`;
      if (isFuzzyWakeToken(joined, variants, hasGreetingPrefix)) {
        const startSlice = hasGreetingPrefix ? i - 1 : i;
        const before = tokens.slice(0, startSlice);
        const after = tokens.slice(i + 2);
        return [...before, ...after].join(' ').replace(/^[,:\s]+/, '').trim();
      }
    }
  }

  return null;
}

/**
 * Pure state-transition parser for high-sensitivity voice activation/deactivation
 * by the user's chosen AI name.
 */
export function parseVoiceActivationCommand(
  rawTranscript: string,
  assistantName: string,
  isCurrentlyActivated: boolean
): VoiceActivationAction {
  const rawTrimmed = rawTranscript.trim();
  const text = rawTrimmed.replace(/[.!?।]+$/g, '').trim();
  if (!text) return { type: 'ignore' };

  const variants = buildNameVariants(assistantName);
  const nameAlternation = variants.map(escapeRegex).join('|');

  // Check deactivation phrases (with or without assistant name)
  const strippedNameForStop = text
    .replace(
      new RegExp(`^(?:hey\\s+|ok\\s+|okay\\s+|hi\\s+|hello\\s+|suno\\s+)?(?:${nameAlternation})[,\\s]*`, 'i'),
      ''
    )
    .trim();

  if (
    isCurrentlyActivated &&
    (DEACTIVATE_PATTERNS.some((p) => p.test(text)) ||
      (strippedNameForStop && DEACTIVATE_PATTERNS.some((p) => p.test(strippedNameForStop))) ||
      new RegExp(`^(?:bye|goodbye|stop|sleep|band|off)\\s+(?:${nameAlternation})\\b`, 'i').test(text))
  ) {
    return { type: 'deactivate' };
  }

  // Exact wake prefix (with optional greeting)
  const wakePrefixRegex = new RegExp(
    `^(?:hey\\s+|ok\\s+|okay\\s+|hi\\s+|hello\\s+|suno\\s+|oye\\s+|listen\\s+)?(?:${nameAlternation})[,:\\s]*(.*)$`,
    'i'
  );
  const wakePrefixMatch = text.match(wakePrefixRegex);
  if (wakePrefixMatch) {
    const remainder = (wakePrefixMatch[1] ?? '').trim();
    if (remainder && DEACTIVATE_PATTERNS.some((p) => p.test(remainder))) {
      return { type: 'deactivate' };
    }
    return { type: 'activate', command: remainder };
  }

  // Exact name mentioned anywhere mid-sentence (e.g. "please jarvis help me")
  const containsNameRegex = new RegExp(`\\b(?:${nameAlternation})\\b`, 'i');
  if (containsNameRegex.test(text)) {
    const remainder = text.replace(new RegExp(`\\b(?:${nameAlternation})\\b[,:\\s]*`, 'gi'), '').trim();
    if (remainder && DEACTIVATE_PATTERNS.some((p) => p.test(remainder))) {
      return { type: 'deactivate' };
    }
    return { type: 'activate', command: remainder };
  }

  // High-sensitivity phonetic / split-word fuzzy wake check
  const fuzzyRemainder = findFuzzyWakeCommand(text, assistantName);
  if (fuzzyRemainder !== null) {
    if (fuzzyRemainder && DEACTIVATE_PATTERNS.some((p) => p.test(fuzzyRemainder))) {
      return { type: 'deactivate' };
    }
    return { type: 'activate', command: fuzzyRemainder };
  }

  if (isCurrentlyActivated) {
    return { type: 'command', command: rawTrimmed };
  }

  // Explicit standby wake phrases
  if (/^(?:activate|wake up|jaag jao|on ho jao)$/i.test(text)) {
    return { type: 'activate', command: '' };
  }

  return { type: 'ignore' };
}

/**
 * Evaluates multiple SpeechRecognition transcript alternatives to boost wake-word sensitivity.
 */
export function parseVoiceActivationAlternatives(
  alternatives: string[],
  assistantName: string,
  isCurrentlyActivated: boolean
): { action: VoiceActivationAction; matchedTranscript: string } {
  const cleaned = alternatives.map((a) => a.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return { action: { type: 'ignore' }, matchedTranscript: '' };
  }

  let commandCandidate: { action: VoiceActivationAction; matchedTranscript: string } | null = null;

  for (const alt of cleaned) {
    const action = parseVoiceActivationCommand(alt, assistantName, isCurrentlyActivated);
    if (action.type === 'deactivate' || action.type === 'activate') {
      return { action, matchedTranscript: alt };
    }
    if (action.type === 'command' && !commandCandidate) {
      commandCandidate = { action, matchedTranscript: alt };
    }
  }

  return commandCandidate ?? { action: { type: 'ignore' }, matchedTranscript: cleaned[0] };
}
