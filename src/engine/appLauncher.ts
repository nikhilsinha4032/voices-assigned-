export type AppLaunchTarget = 'spotify' | 'youtube' | 'whatsapp' | 'chrome' | 'drive';

export interface AppLaunchIntent {
  target: AppLaunchTarget;
  label: string;
  query: string;
  webUrl: string;
  appUri?: string;
  summaryPrompt?: string;
  replyEn: string;
  replyHi: string;
}

const MOOD_REFRESH_RE =
  /\b(mind\s*fresh|fresh\s*(?:mind|mood|ho)|mood\s*fresh|relax|relaxing|chill|calm|peace|stress\s*free|feel\s*good|happy|lofi|lo-fi|achha\s*sa|koi\s*achha|accha\s*sa)\b/i;

const GENERIC_FILLER_RE =
  /\b(please|jarvis|mere\s*liye|mera|mujhe|on\s*kar\s*do|on\s*karo|chalu\s*kar\s*do|chalu\s*karo|chalao|chala\s*do|open\s*kar\s*do|open\s*karo|open|launch|start|khol\s*do|kholo|baja\s*do|bajao|play|dikhao|search\s*karke\s*dikhao|search\s*kar\s*do|search\s*karo|search|karke|dikha\s*do|se|par|pe|mein|me|ka|ke|ki|wala|wali|wale|browser|app|music|gaana|gaane|songs?|koi|achha|accha|sa|jisse|ho\s*jaye|mind|fresh|kar\s*do|karo)\b/gi;

function extractMeaningfulTopic(raw: string, extraStripPatterns: RegExp[]): string {
  let cleaned = raw.trim();
  for (const re of extraStripPatterns) {
    cleaned = cleaned.replace(re, ' ');
  }
  cleaned = cleaned
    .replace(GENERIC_FILLER_RE, ' ')
    .replace(/[?.!,।]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

export function parseAppLaunchIntent(rawClause: string): AppLaunchIntent | null {
  const clause = rawClause.trim();
  if (!clause) return null;
  const lower = clause.toLowerCase();

  // 1. WhatsApp
  if (/\b(?:whats\s*app|whatsap|watsapp)\b|व्हाट्सएप|वॉट्सएप|वाट्सएप/i.test(lower)) {
    const msgMatch = clause.match(
      /(?:message|msg|bhejo|send|likho|bol|text)\s*(?:ki|that|:|-)?\s*(.+)$/i
    );
    const extractedMsg = (msgMatch?.[1] ?? '')
      .replace(/\b(?:whats\s*app|on\s*kar\s*do|open\s*karo|kholo|kar\s*do)\b/gi, '')
      .trim();

    if (extractedMsg && extractedMsg.length >= 2 && !/^(?:on|open|app|par|pe)$/i.test(extractedMsg)) {
      const encoded = encodeURIComponent(extractedMsg);
      return {
        target: 'whatsapp',
        label: 'WhatsApp',
        query: extractedMsg,
        webUrl: `https://wa.me/?text=${encoded}`,
        appUri: `whatsapp://send?text=${encoded}`,
        replyEn: `Opening WhatsApp with your message "${extractedMsg}".`,
        replyHi: `WhatsApp khol raha hoon "${extractedMsg}" message ke saath.`,
      };
    }

    return {
      target: 'whatsapp',
      label: 'WhatsApp',
      query: 'Open WhatsApp',
      webUrl: 'https://web.whatsapp.com/',
      appUri: 'whatsapp://',
      replyEn: 'Opening WhatsApp now.',
      replyHi: 'WhatsApp on kar diya hai.',
    };
  }

  // 2. Spotify
  if (/\b(?:spotify|spotyfy)\b|स्पॉटिफाई/i.test(lower)) {
    const wantsMusic =
      /\b(music|gaana|gaane|songs?|playlist|play|chalao|bajao|sunao|mood|fresh)\b/i.test(lower) ||
      MOOD_REFRESH_RE.test(lower);

    const specificTopic = extractMeaningfulTopic(clause, [
      /\b(?:spotify|spotyfy)\b/gi,
      /स्पॉटिफाई/g,
    ]);

    let query = '';
    if (MOOD_REFRESH_RE.test(lower) && !specificTopic) {
      query = 'mind fresh feel good chill songs';
    } else if (specificTopic) {
      query = MOOD_REFRESH_RE.test(lower) ? `${specificTopic} feel good fresh` : specificTopic;
    } else if (wantsMusic) {
      query = 'top feel good mood booster hits';
    }

    if (query) {
      const encoded = encodeURIComponent(query);
      return {
        target: 'spotify',
        label: 'Spotify Music',
        query,
        webUrl: `https://open.spotify.com/search/${encoded}`,
        appUri: `spotify:search:${encoded}`,
        replyEn: `Opening Spotify for "${query}".`,
        replyHi: `Spotify par "${query}" chala raha hoon taaki mood fresh ho jaye.`,
      };
    }

    return {
      target: 'spotify',
      label: 'Spotify',
      query: 'Open Spotify',
      webUrl: 'https://open.spotify.com/',
      appUri: 'spotify://',
      replyEn: 'Opening Spotify now.',
      replyHi: 'Spotify open kar diya hai.',
    };
  }

  // 3. YouTube
  if (/\b(?:you\s*tube|yt)\b|यूट्यूब/i.test(lower)) {
    const wantsMusic = /\b(music|gaana|gaane|songs?|video|play|chalao|bajao|sunao)\b/i.test(lower);
    const specificTopic = extractMeaningfulTopic(clause, [
      /\b(?:you\s*tube|yt)\b/gi,
      /यूट्यूब/g,
    ]);

    let query = '';
    if (MOOD_REFRESH_RE.test(lower) && !specificTopic) {
      query = 'mind fresh relaxing feel good music';
    } else if (specificTopic) {
      query = wantsMusic && !/\b(music|songs?|gaana)\b/i.test(specificTopic)
        ? `${specificTopic} music`
        : specificTopic;
    } else if (wantsMusic) {
      query = 'best mood fresh music playlist';
    }

    if (query) {
      const encoded = encodeURIComponent(query);
      return {
        target: 'youtube',
        label: 'YouTube',
        query,
        webUrl: `https://www.youtube.com/results?search_query=${encoded}`,
        replyEn: `Opening YouTube for "${query}".`,
        replyHi: `YouTube par "${query}" open kar diya hai.`,
      };
    }

    return {
      target: 'youtube',
      label: 'YouTube',
      query: 'Open YouTube',
      webUrl: 'https://www.youtube.com/',
      replyEn: 'Opening YouTube now.',
      replyHi: 'YouTube open kar diya hai.',
    };
  }

  // 4. Google Drive (must run before generic Google/Chrome search)
  const mentionsDrive =
    /\b(?:google\s*drive|my\s*drive|g\s*drive)\b|\bdrive\b.*\b(?:open|kholo|khol|on|files?|search|upload|note|save|dikhao|batao)\b|गूगल\s*ड्राइव|ड्राइव/i.test(
      lower
    );

  if (mentionsDrive) {
    const driveTopic = extractMeaningfulTopic(clause, [
      /\b(?:google\s*drive|my\s*drive|g\s*drive|drive|files?)\b/gi,
      /गूगल\s*ड्राइव|ड्राइव|फाइल्स?|फाइल/g,
    ]);

    if (driveTopic && driveTopic.length >= 2) {
      return {
        target: 'drive',
        label: 'Google Drive',
        query: driveTopic,
        webUrl: `https://drive.google.com/drive/search?q=${encodeURIComponent(driveTopic)}`,
        replyEn: `Opening Google Drive to search for "${driveTopic}".`,
        replyHi: `Google Drive kholkar "${driveTopic}" search kar raha hoon.`,
      };
    }

    return {
      target: 'drive',
      label: 'Google Drive',
      query: 'Open Google Drive',
      webUrl: 'https://drive.google.com/',
      replyEn: 'Opening Google Drive now.',
      replyHi: 'Google Drive open kar diya hai.',
    };
  }

  // 5. Chrome / Google Web Search
  const mentionsChromeOrGoogle =
    /\b(?:chrome|google|browser)\b|क्रोम|गूगल|ब्राउज़र|ब्राउजर/i.test(lower);
  const explicitWebSearch =
    /\b(?:search\s+(?:for|about|on|karke|karo|kar\s*do)?|google\s+karo|web\s+search)\b/i.test(lower);

  if (mentionsChromeOrGoogle || explicitWebSearch) {
    // Strip explicit chrome/google/search framing cleanly while preserving the actual search terms
    const stripped = clause
      .replace(/^(?:please\s+)?(?:jarvis\s*,?\s*)?/i, '')
      .replace(/\b(?:in|on|from|via|using|with|se|par|pe|mein|me)?\s*(?:google\s+)?(?:chrome|browser|google)\s*(?:browser)?\s*(?:se|par|pe|mein|me)?/gi, ' ')
      .replace(/\b(?:search\s*karke\s*dikhao|search\s*kar\s*do|search\s*karo|search\s*for|search|dikhao|batao|open\s*kar\s*do|open\s*karo|open|kholo)\b/gi, ' ')
      .replace(/क्रोम|गूगल|ब्राउज़र|ब्राउजर/g, ' ')
      .replace(/\b(?:mujhe|jo\s*main\s*bolu|wo|vo|kar\s*do|karo|karke|dikha\s*do)\b/gi, ' ')
      .replace(/[?.!,।]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (stripped.length >= 2) {
      const encoded = encodeURIComponent(stripped);
      return {
        target: 'chrome',
        label: 'Chrome Search',
        query: stripped,
        webUrl: `https://www.google.com/search?q=${encoded}`,
        summaryPrompt: `Give a crisp, accurate 1-2 sentence web search answer for: "${stripped}"`,
        replyEn: `Searching Chrome for "${stripped}".`,
        replyHi: `Chrome par "${stripped}" search kar raha hoon.`,
      };
    }

    return {
      target: 'chrome',
      label: 'Chrome Browser',
      query: 'Open Google Chrome',
      webUrl: 'https://www.google.com/',
      replyEn: 'Opening Google Chrome search.',
      replyHi: 'Chrome browser open kar diya hai.',
    };
  }

  return null;
}
