import type {
  AssistantMood,
  EmotionSettings,
  LanguageMode,
  UserEmotion,
  VoiceSettings,
} from '../types/assistant';

const STRESS_PATTERNS = [
  /\bstress(ed|ful)?\b/i,
  /\boverwhelm(ed|ing)?\b/i,
  /\banxious\b/i,
  /\bpanic\b/i,
  /\btoo much\b/i,
  /\bfrustrat(ed|ing)\b/i,
  /\bworried\b/i,
  /\bbehind on\b/i,
  /\bpareshan\b/i,
  /\btension\b/i,
  /\bchinta\b/i,
  /परेशान/i,
  /तनाव/i,
];

const TIRED_PATTERNS = [
  /\btired\b/i,
  /\bexhausted\b/i,
  /\bsleepy\b/i,
  /\bdrained\b/i,
  /\bfatigue\b/i,
  /\bburnt out\b/i,
  /\bburned out\b/i,
  /\blong day\b/i,
  /\bneed rest\b/i,
  /\bthak\b/i,
  /\bthakan\b/i,
  /\bneend\b/i,
  /थक/i,
  /नींद/i,
];

const HAPPY_PATTERNS = [
  /\bhappy\b/i,
  /\bgreat\b/i,
  /\bexcited\b/i,
  /\bawesome\b/i,
  /\blove it\b/i,
  /\bthank(s| you)\b/i,
  /\bamazing\b/i,
  /\benergized\b/i,
  /\bfeeling good\b/i,
  /\bproud\b/i,
  /\bkhush\b/i,
  /\bshukriya\b/i,
  /\bmaza\b/i,
  /\bbadiya\b/i,
  /खुश/i,
  /शुक्रिया/i,
];

const URGENT_PATTERNS = [
  /\burgent\b/i,
  /\bright now\b/i,
  /\bhurry\b/i,
  /\basap\b/i,
  /\bquickly\b/i,
  /\bimmediately\b/i,
  /\brunning late\b/i,
  /\bjaldi\b/i,
  /\babhi\b/i,
  /जल्दी/i,
];

const CALM_PATTERNS = [
  /\bcalm\b/i,
  /\bpeaceful\b/i,
  /\brelax(ed|ing)?\b/i,
  /\bchill\b/i,
  /\bserene\b/i,
  /\bshant\b/i,
  /\bsukoon\b/i,
  /शांत/i,
];

export function detectUserEmotion(input: string): UserEmotion {
  const text = input.trim();
  if (!text) return 'neutral';
  if (STRESS_PATTERNS.some((p) => p.test(text))) return 'stressed';
  if (TIRED_PATTERNS.some((p) => p.test(text))) return 'tired';
  if (URGENT_PATTERNS.some((p) => p.test(text))) return 'urgent';
  if (HAPPY_PATTERNS.some((p) => p.test(text))) return 'happy';
  if (CALM_PATTERNS.some((p) => p.test(text))) return 'calm';
  return 'neutral';
}

export function computeNextMood(
  currentMood: AssistantMood,
  userEmotion: UserEmotion,
  settings: EmotionSettings,
  pendingTaskCount: number
): AssistantMood {
  if (userEmotion === 'stressed' || userEmotion === 'tired') {
    return settings.empathyLevel >= 40 ? 'empathetic' : 'serene';
  }
  if (userEmotion === 'urgent') {
    return 'focused';
  }
  if (userEmotion === 'happy') {
    return settings.expressiveness >= 50 ? 'playful' : 'encouraging';
  }
  if (userEmotion === 'calm') {
    return 'serene';
  }

  switch (settings.temperament) {
    case 'upbeat-coach':
      return pendingTaskCount > 0 ? 'encouraging' : 'playful';
    case 'crisp-executive':
      return 'focused';
    case 'calm-concierge':
      return 'serene';
    case 'warm-companion':
    default:
      return settings.empathyLevel >= 60 ? 'warm' : currentMood;
  }
}

export function computeEmotionalProsody(
  mood: AssistantMood,
  userEmotion: UserEmotion,
  emotionSettings: EmotionSettings,
  voiceSettings: VoiceSettings
): { rate: number; pitch: number; pauseStyle: 'gentle' | 'crisp' | 'bright' } {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  if (!voiceSettings.emotionalProsody) {
    return {
      rate: clamp(voiceSettings.rate, 0.7, 1.4),
      pitch: clamp(voiceSettings.pitch, 0.75, 1.3),
      pauseStyle: 'crisp',
    };
  }

  const expressivenessScale = (emotionSettings.expressiveness / 100) * 0.6;
  let rateDelta = 0;
  let pitchDelta = 0;
  let pauseStyle: 'gentle' | 'crisp' | 'bright' = 'gentle';

  if (userEmotion === 'stressed' || userEmotion === 'tired' || mood === 'empathetic') {
    rateDelta = -0.05 * expressivenessScale;
    pitchDelta = -0.03 * expressivenessScale;
    pauseStyle = 'gentle';
  } else if (mood === 'serene') {
    rateDelta = -0.03 * expressivenessScale;
    pitchDelta = -0.02 * expressivenessScale;
    pauseStyle = 'gentle';
  } else if (mood === 'playful' || mood === 'encouraging' || userEmotion === 'happy') {
    rateDelta = 0.02 * expressivenessScale;
    pitchDelta = 0.03 * expressivenessScale;
    pauseStyle = 'bright';
  } else if (mood === 'focused' || userEmotion === 'urgent') {
    rateDelta = 0.03 * expressivenessScale;
    pitchDelta = 0;
    pauseStyle = 'crisp';
  } else if (mood === 'warm') {
    rateDelta = -0.01 * expressivenessScale;
    pitchDelta = 0.01 * expressivenessScale;
    pauseStyle = 'gentle';
  }

  return {
    rate: Number(clamp(voiceSettings.rate + rateDelta, 0.78, 1.25).toFixed(2)),
    pitch: Number(clamp(voiceSettings.pitch + pitchDelta, 0.85, 1.15).toFixed(2)),
    pauseStyle,
  };
}

export function shapeHumanResponse(
  coreOutcome: string,
  opts: {
    mood: AssistantMood;
    userEmotion: UserEmotion;
    settings: EmotionSettings;
    intentKind: string;
    pendingTaskCount?: number;
    languageMode?: LanguageMode;
  }
): string {
  const {
    mood,
    userEmotion,
    settings,
    intentKind,
    pendingTaskCount = 0,
    languageMode = 'english',
  } = opts;
  const name = settings.userName.trim() || 'there';
  const highEmpathy = settings.empathyLevel >= 60;
  const highExpressive = settings.expressiveness >= 60;
  const isFormal = settings.formality === 'formal';
  const isCasual = settings.formality === 'casual';
  const useHinglish = languageMode === 'hinglish' || languageMode === 'hindi';

  if (settings.temperament === 'crisp-executive' && settings.empathyLevel < 45) {
    return coreOutcome;
  }

  let leadIn = '';
  let followUp = '';

  if (userEmotion === 'stressed' && intentKind !== 'general') {
    leadIn = highEmpathy
      ? useHinglish
        ? `Aaram se ${name}, main yahin hoon. Hum ek-ek karke sab handle kar lenge. `
        : isFormal
        ? `Take a breath, ${name}. I have your back. `
        : `Hey ${name}, take a slow breath—we can handle this one step at a time. `
      : '';
    if (settings.proactiveCare && pendingTaskCount > 3 && intentKind !== 'emotional_support') {
      followUp = useHinglish
        ? ' Bolo toh main kuch lights dim kar doon ya schedule thoda halka kar doon?'
        : ' Would you like me to clear some breathing room in your schedule or dim the lights?';
    }
  } else if (userEmotion === 'tired') {
    leadIn = highEmpathy
      ? useHinglish
        ? `Lagta hai aaj kaafi thak gaye ho, ${name}. `
        : isCasual
        ? `You sound ready for some rest, ${name}. `
        : `I hear how tired you are, ${name}. `
      : '';
    if (settings.proactiveCare && intentKind === 'device') {
      followUp = useHinglish
        ? ' Bolo toh evening wind-down routine chalu kar doon.'
        : ' Let me know if you want me to kick off your evening wind-down.';
    }
  } else if (userEmotion === 'happy') {
    leadIn = highExpressive
      ? useHinglish
        ? `Bahut badhiya energy hai, ${name}! `
        : isCasual
        ? `Love hearing that energy, ${name}! `
        : `That is wonderful to hear, ${name}. `
      : '';
  } else if (userEmotion === 'urgent') {
    leadIn = useHinglish ? 'Bilkul abhi karta hoon — ' : isFormal ? 'Right away. ' : 'On it right now—';
  } else if (mood === 'warm' && highExpressive && intentKind === 'greeting') {
    leadIn = useHinglish
      ? `Tumhari aawaz sunkar accha laga, ${name}. `
      : isCasual
      ? `Always good to hear your voice, ${name}. `
      : `Good to be with you, ${name}. `;
  } else if (mood === 'encouraging' && intentKind === 'task_complete' && highExpressive) {
    followUp = useHinglish
      ? ' Shabaash, ek kaam aur poora hua!'
      : ' Nice momentum—one less thing on your mind.';
  }

  return `${leadIn}${coreOutcome}${followUp}`.replace(/\s+/g, ' ').trim();
}

export function describeAssistantFeeling(
  mood: AssistantMood,
  settings: EmotionSettings
): { label: string; reflection: string } {
  const name = settings.userName.trim() || 'you';
  switch (mood) {
    case 'empathetic':
      return {
        label: 'Attentive & Caring',
        reflection: `I am tuned into a gentler pace right now so ${name} feels supported rather than rushed.`,
      };
    case 'serene':
      return {
        label: 'Calm & Grounded',
        reflection: 'Everything here is steady and quiet. Ready whenever you want a hand.',
      };
    case 'encouraging':
      return {
        label: 'Encouraging & Ready',
        reflection: 'Feeling energized to help you clear today’s priorities cleanly.',
      };
    case 'focused':
      return {
        label: 'Focused & Crisp',
        reflection: 'Keeping my responses brief and direct so you can move quickly.',
      };
    case 'playful':
      return {
        label: 'Warm & Upbeat',
        reflection: 'In great spirits—glad to see things flowing smoothly today.',
      };
    case 'warm':
    default:
      return {
        label: 'Warm & Present',
        reflection: `Feeling present and attentive to your routine and home comfort, ${name}.`,
      };
  }
}
