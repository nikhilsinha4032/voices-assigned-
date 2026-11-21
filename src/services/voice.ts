import { computeEmotionalProsody } from '../engine/emotion';
import { computeSpectralSignature } from '../engine/voiceprint';
import type {
  AssistantMood,
  EmotionSettings,
  LanguageMode,
  UserEmotion,
  VoiceprintSignature,
  VoiceSettings,
} from '../types/assistant';

export interface LocalVoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}

const SOFT_NATURAL_VOICE_KEYWORDS = [
  'natural',
  'neural',
  'neerja',
  'veena',
  'lekha',
  'rishi',
  'samantha',
  'ava',
  'allison',
  'google हिन्दी',
  'google uk english female',
  'google us english',
  'karen',
  'daniel',
  'enhanced',
];

const HARSH_VOICE_KEYWORDS = ['espeak', 'festival', 'speech-dispatcher', 'mbrola'];

let activeSpeakSession = 0;
let activeSpeakTimer: number | null = null;
let activeWatchdogTimer: number | null = null;
let activeLevelSimTimer: number | null = null;
let activeTtsAbort: AbortController | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let neuralTtsCooldownUntil = 0;
let unlockListenersAttached = false;
let speechUnlocked = false;
let pendingBlockedSpeak: (() => void) | null = null;
let sharedAudioCtx: AudioContext | null = null;
const activePlaybackSources = new Set<AudioBufferSourceNode>();
const pcmPhraseCache = new Map<string, Uint8Array>();

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx({ sampleRate: 24000 });
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function unlockSpeechEngineOnGesture(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    if (!speechUnlocked && !window.speechSynthesis.speaking) {
      const primer = new SpeechSynthesisUtterance(' ');
      primer.volume = 0;
      primer.rate = 2;
      window.speechSynthesis.speak(primer);
      speechUnlocked = true;
    }
  } catch {
    // ignore
  }
}

function ensureAudioUnlockListeners(): void {
  if (typeof window === 'undefined' || unlockListenersAttached) return;
  unlockListenersAttached = true;
  const unlock = () => {
    getSharedAudioContext();
    unlockSpeechEngineOnGesture();
    if (pendingBlockedSpeak) {
      const replay = pendingBlockedSpeak;
      pendingBlockedSpeak = null;
      replay();
    }
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

if (typeof window !== 'undefined') {
  ensureAudioUnlockListeners();
}

export function primeAudioPlayback(): void {
  ensureAudioUnlockListeners();
  getSharedAudioContext();
  if (
    typeof navigator !== 'undefined' &&
    (navigator as unknown as { userActivation?: { isActive?: boolean } }).userActivation?.isActive
  ) {
    unlockSpeechEngineOnGesture();
  }
}

export function setNeuralTtsCooldown(durationMs = 15 * 60_000): void {
  neuralTtsCooldownUntil = Math.max(neuralTtsCooldownUntil, Date.now() + durationMs);
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getAvailableVoices(): LocalVoiceOption[] {
  if (!isSpeechSynthesisSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  const filtered = voices.filter((v) => {
    const l = v.lang.toLowerCase();
    return l.startsWith('en') || l.startsWith('hi');
  });
  const pool = filtered.length > 0 ? filtered : voices;

  return [...pool]
    .sort((a, b) => {
      const aHarsh = HARSH_VOICE_KEYWORDS.some((k) => a.name.toLowerCase().includes(k)) ? 1 : 0;
      const bHarsh = HARSH_VOICE_KEYWORDS.some((k) => b.name.toLowerCase().includes(k)) ? 1 : 0;
      if (aHarsh !== bHarsh) return aHarsh - bHarsh;

      const aPref = SOFT_NATURAL_VOICE_KEYWORDS.some((k) => a.name.toLowerCase().includes(k)) ? 1 : 0;
      const bPref = SOFT_NATURAL_VOICE_KEYWORDS.some((k) => b.name.toLowerCase().includes(k)) ? 1 : 0;
      if (aPref !== bPref) return bPref - aPref;

      const aLocal = a.localService ? 1 : 0;
      const bLocal = b.localService ? 1 : 0;
      if (aLocal !== bLocal) return bLocal - aLocal;

      return a.name.localeCompare(b.name);
    })
    .map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      localService: v.localService,
    }));
}

function clearSpeechTimers(): void {
  if (activeSpeakTimer !== null) {
    window.clearTimeout(activeSpeakTimer);
    activeSpeakTimer = null;
  }
  if (activeWatchdogTimer !== null) {
    window.clearInterval(activeWatchdogTimer);
    activeWatchdogTimer = null;
  }
  if (activeLevelSimTimer !== null) {
    window.clearInterval(activeLevelSimTimer);
    activeLevelSimTimer = null;
  }
}

function stopNeuralSources(): void {
  activeTtsAbort?.abort();
  activeTtsAbort = null;
  activePlaybackSources.forEach((src) => {
    try {
      src.stop();
    } catch {
      // ignore
    }
  });
  activePlaybackSources.clear();
}

export function stopSpeaking(): void {
  activeSpeakSession += 1;
  pendingBlockedSpeak = null;
  clearSpeechTimers();
  stopNeuralSources();
  activeUtterance = null;
  if (isSpeechSynthesisSupported()) {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Keeps normal 1-3 sentence answers (<= 360 chars) as ONE continuous utterance so
 * speech never stutters or buffers mid-answer, only splitting very long replies.
 */
function splitSpeechChunks(raw: string): string[] {
  const cleaned = raw
    .replace(/[*_`#~]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[""]/g, '')
    .trim();
  if (!cleaned) return [];
  if (cleaned.length <= 360) return [cleaned];

  const sentences = cleaned
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length <= 360) {
      current = (current ? current + ' ' : '') + sentence;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = '';
    }
    if (sentence.length <= 360) {
      current = sentence;
      continue;
    }
    const subParts = sentence.split(/(?<=[,;—–])\s+/).filter(Boolean);
    let buffer = '';
    for (const part of subParts) {
      if ((buffer + ' ' + part).trim().length <= 360) {
        buffer = (buffer ? buffer + ' ' : '') + part;
      } else {
        if (buffer) chunks.push(buffer);
        buffer = part;
      }
    }
    if (buffer) chunks.push(buffer);
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [cleaned];
}

function schedulePcm16Buffer(
  ctx: AudioContext,
  pcmBytes: Uint8Array,
  nextStartTimeRef: { current: number },
  playbackRate: number,
  sessionId: number,
  onAudioLevel?: (level: number) => void
): AudioBufferSourceNode | null {
  const sampleCount = Math.floor(pcmBytes.byteLength / 2);
  if (sampleCount <= 0) return null;

  const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, sampleCount * 2);
  const float32 = new Float32Array(sampleCount);
  let sumSq = 0;
  for (let i = 0; i < sampleCount; i++) {
    const s = view.getInt16(i * 2, true) / 0x8000;
    float32[i] = s;
    if ((i & 31) === 0) sumSq += s * s;
  }

  const audioBuffer = ctx.createBuffer(1, sampleCount, 24000);
  audioBuffer.getChannelData(0).set(float32);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = Math.min(1.18, Math.max(0.84, playbackRate));
  source.connect(ctx.destination);

  const startAt = Math.max(ctx.currentTime + 0.015, nextStartTimeRef.current);
  nextStartTimeRef.current = startAt + audioBuffer.duration / source.playbackRate.value;
  activePlaybackSources.add(source);

  const sampledCount = Math.max(1, Math.ceil(sampleCount / 32));
  const rms = Math.min(1, Math.sqrt(sumSq / sampledCount) * 3.4);
  if (sessionId === activeSpeakSession) {
    onAudioLevel?.(rms);
  }

  source.onended = () => {
    activePlaybackSources.delete(source);
  };
  source.start(startAt);
  return source;
}

async function speakViaNeuralHumanTts(
  text: string,
  opts: {
    sessionId: number;
    mood: AssistantMood;
    voiceSettings: VoiceSettings;
    onStart?: () => void;
    onEnd?: () => void;
    onAudioLevel?: (level: number) => void;
  }
): Promise<boolean> {
  if (Date.now() < neuralTtsCooldownUntil) {
    return false;
  }

  const ctx = getSharedAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    await Promise.race([
      ctx.resume().catch(() => {}),
      new Promise<void>((resolve) => window.setTimeout(resolve, 120)),
    ]);
  }
  // If browser has not yet unlocked Web Audio with a click/key gesture, don't block — fall back immediately
  if (ctx.state !== 'running') {
    return false;
  }

  const voiceName = opts.voiceSettings.humanVoiceName || 'Zephyr';
  const cacheKey = `${voiceName}:${text}`;
  const playbackRate = opts.voiceSettings.rate || 0.98;
  const nextStartTimeRef = { current: ctx.currentTime + 0.02 };

  // Instant 0ms playback if this phrase was spoken recently
  const cached = pcmPhraseCache.get(cacheKey);
  if (cached && cached.byteLength >= 4) {
    if (opts.sessionId !== activeSpeakSession) return true;
    opts.onStart?.();
    const src = schedulePcm16Buffer(
      ctx,
      cached,
      nextStartTimeRef,
      playbackRate,
      opts.sessionId,
      opts.onAudioLevel
    );
    if (!src) {
      opts.onAudioLevel?.(0);
      opts.onEnd?.();
      return true;
    }
    await new Promise<void>((resolve) => {
      src.onended = () => {
        activePlaybackSources.delete(src);
        resolve();
      };
    });
    if (opts.sessionId === activeSpeakSession) {
      opts.onAudioLevel?.(0);
      opts.onEnd?.();
    }
    return true;
  }

  const abortController = new AbortController();
  activeTtsAbort = abortController;
  const fetchTimeout = window.setTimeout(() => abortController.abort(), 3500);

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal,
      body: JSON.stringify({
        text,
        voiceName,
        mood: opts.mood,
      }),
    });
    window.clearTimeout(fetchTimeout);

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !res.body || !contentType.includes('audio/')) {
      neuralTtsCooldownUntil = Date.now() + 15 * 60_000;
      return false;
    }

    const reader = res.body.getReader();
    let remainder: Uint8Array | null = null;
    const collectedChunks: Uint8Array[] = [];
    let started = false;
    let lastSource: AudioBufferSourceNode | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (opts.sessionId !== activeSpeakSession) {
        abortController.abort();
        return true;
      }
      if (!value || value.byteLength === 0) continue;

      let combined: Uint8Array;
      if (remainder && remainder.byteLength > 0) {
        combined = new Uint8Array(remainder.byteLength + value.byteLength);
        combined.set(remainder, 0);
        combined.set(value, remainder.byteLength);
        remainder = null;
      } else {
        combined = value;
      }

      const usableBytes = combined.byteLength - (combined.byteLength % 2);
      if (combined.byteLength % 2 === 1) {
        remainder = combined.slice(usableBytes);
      }

      if (usableBytes >= 2) {
        const slice = combined.subarray(0, usableBytes);
        collectedChunks.push(slice);
        if (!started) {
          started = true;
          opts.onStart?.();
        }
        const scheduled = schedulePcm16Buffer(
          ctx,
          slice,
          nextStartTimeRef,
          playbackRate,
          opts.sessionId,
          opts.onAudioLevel
        );
        if (scheduled) lastSource = scheduled;
      }
    }

    if (!started || !lastSource) {
      return false;
    }

    // Cache short/medium phrases for 0ms instant replay
    const totalLen = collectedChunks.reduce((acc, c) => acc + c.byteLength, 0);
    if (totalLen > 0 && totalLen <= 720_000) {
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of collectedChunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }
      if (pcmPhraseCache.size >= 16) {
        const firstKey = pcmPhraseCache.keys().next().value;
        if (firstKey) pcmPhraseCache.delete(firstKey);
      }
      pcmPhraseCache.set(cacheKey, merged);
    }

    await new Promise<void>((resolve) => {
      const target = lastSource!;
      const prevOnEnded = target.onended;
      target.onended = (ev) => {
        if (prevOnEnded) prevOnEnded.call(target, ev);
        resolve();
      };
    });

    if (opts.sessionId === activeSpeakSession) {
      opts.onAudioLevel?.(0);
      opts.onEnd?.();
    }
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(fetchTimeout);
    if (activeTtsAbort === abortController) {
      activeTtsAbort = null;
    }
  }
}

function pickBestSynthesisVoice(
  chunk: string,
  allVoices: SpeechSynthesisVoice[],
  voiceSettings: VoiceSettings
): { voice?: SpeechSynthesisVoice; lang: string } {
  const hasDevanagari = /[\u0900-\u097F]/.test(chunk);
  if (voiceSettings.voiceURI !== 'auto') {
    const explicit = allVoices.find((v) => v.voiceURI === voiceSettings.voiceURI);
    if (explicit && (!hasDevanagari || explicit.lang.toLowerCase().startsWith('hi'))) {
      return { voice: explicit, lang: explicit.lang };
    }
  }

  const ranked = getAvailableVoices();
  const preferredLang = hasDevanagari ? 'hi-in' : (voiceSettings.speechLang || 'en-IN').toLowerCase();
  // Prefer reliable localService voices first when available to avoid silent remote-TTS stalls
  const match =
    ranked.find((v) => v.localService && v.lang.toLowerCase() === preferredLang) ??
    ranked.find((v) => v.localService && v.lang.toLowerCase().startsWith(preferredLang.slice(0, 2))) ??
    ranked.find((v) => v.lang.toLowerCase() === preferredLang) ??
    ranked.find((v) => v.lang.toLowerCase().startsWith(preferredLang.slice(0, 2))) ??
    ranked.find((v) => v.localService && v.lang.toLowerCase().startsWith('en')) ??
    ranked.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    ranked[0];

  if (match) {
    const found = allVoices.find((v) => v.voiceURI === match.voiceURI);
    if (found) {
      return { voice: found, lang: found.lang };
    }
  }

  return { lang: hasDevanagari ? 'hi-IN' : voiceSettings.speechLang || 'en-IN' };
}

function speakWithBrowserSynthesisFallback(
  text: string,
  sessionId: number,
  opts: {
    mood: AssistantMood;
    userEmotion: UserEmotion;
    emotionSettings: EmotionSettings;
    voiceSettings: VoiceSettings;
    onStart?: () => void;
    onEnd?: () => void;
    onBlocked?: () => void;
    onAudioLevel?: (level: number) => void;
  }
): void {
  if (!isSpeechSynthesisSupported()) {
    opts.onEnd?.();
    return;
  }

  const chunks = splitSpeechChunks(text);
  if (chunks.length === 0) {
    opts.onEnd?.();
    return;
  }

  const prosody = computeEmotionalProsody(
    opts.mood,
    opts.userEmotion,
    opts.emotionSettings,
    opts.voiceSettings
  );

  const launchQueue = () => {
    if (sessionId !== activeSpeakSession) return;

    let started = false;
    let index = 0;
    let safetyFinishTimer: number | null = null;
    let startWatchdogTimer: number | null = null;

    const clearChunkTimers = () => {
      if (safetyFinishTimer !== null) {
        window.clearTimeout(safetyFinishTimer);
        safetyFinishTimer = null;
      }
      if (startWatchdogTimer !== null) {
        window.clearTimeout(startWatchdogTimer);
        startWatchdogTimer = null;
      }
    };

    const finishSpeech = () => {
      clearChunkTimers();
      clearSpeechTimers();
      activeUtterance = null;
      if (sessionId === activeSpeakSession) {
        opts.onAudioLevel?.(0);
        opts.onEnd?.();
      }
    };

    activeWatchdogTimer = window.setInterval(() => {
      if (sessionId !== activeSpeakSession) {
        clearSpeechTimers();
        return;
      }
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 2000);

    const speakNext = (allowRetryWithoutVoice = true) => {
      if (sessionId !== activeSpeakSession) return;
      if (index >= chunks.length) {
        finishSpeech();
        return;
      }

      clearChunkTimers();

      const chunk = chunks[index];
      const allVoices = window.speechSynthesis.getVoices();
      const picked = pickBestSynthesisVoice(chunk, allVoices, opts.voiceSettings);

      const utterance = new SpeechSynthesisUtterance(chunk);
      // Retain module reference so Chromium GC never drops the utterance mid-speech
      activeUtterance = utterance;
      utterance.rate = prosody.rate;
      utterance.pitch = prosody.pitch;
      utterance.lang = picked.lang;
      utterance.volume = 0.96;
      if (allowRetryWithoutVoice && picked.voice) {
        utterance.voice = picked.voice;
      }

      let chunkStarted = false;

      // If a remote/broken voice hangs silently without firing onstart within 1.2s, retry using default voice
      if (allowRetryWithoutVoice && utterance.voice) {
        startWatchdogTimer = window.setTimeout(() => {
          if (
            !chunkStarted &&
            sessionId === activeSpeakSession &&
            activeUtterance === utterance
          ) {
            try {
              window.speechSynthesis.cancel();
            } catch {
              // ignore
            }
            activeSpeakTimer = window.setTimeout(() => speakNext(false), 60);
          }
        }, 1200);
      }

      // Guarantee isSpeaking never gets stuck if a browser engine drops onend
      safetyFinishTimer = window.setTimeout(
        () => {
          if (sessionId === activeSpeakSession && activeUtterance === utterance) {
            index += 1;
            if (index < chunks.length) {
              speakNext(true);
            } else {
              finishSpeech();
            }
          }
        },
        Math.max(4500, chunk.length * 140)
      );

      utterance.onstart = () => {
        if (sessionId !== activeSpeakSession) return;
        chunkStarted = true;
        speechUnlocked = true;
        if (startWatchdogTimer !== null) {
          window.clearTimeout(startWatchdogTimer);
          startWatchdogTimer = null;
        }
        if (!started) {
          started = true;
          opts.onStart?.();
          if (activeLevelSimTimer === null) {
            let phase = 0;
            activeLevelSimTimer = window.setInterval(() => {
              if (sessionId !== activeSpeakSession) return;
              phase += 0.6;
              opts.onAudioLevel?.(0.32 + Math.abs(Math.sin(phase)) * 0.35);
            }, 90);
          }
        }
      };

      utterance.onend = () => {
        if (sessionId !== activeSpeakSession) return;
        clearChunkTimers();
        index += 1;
        if (index < chunks.length) {
          activeSpeakTimer = window.setTimeout(() => speakNext(true), 40);
        } else {
          finishSpeech();
        }
      };

      utterance.onerror = (ev) => {
        if (sessionId !== activeSpeakSession) return;
        clearChunkTimers();
        const errCode = (ev as unknown as { error?: string })?.error ?? '';
        if (errCode === 'not-allowed') {
          pendingBlockedSpeak = () => {
            speakHumanized(text, opts);
          };
          opts.onBlocked?.();
          finishSpeech();
          return;
        }
        if (allowRetryWithoutVoice && utterance.voice) {
          activeSpeakTimer = window.setTimeout(() => speakNext(false), 60);
          return;
        }
        finishSpeech();
      };

      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        finishSpeech();
      }
    };

    speakNext(true);
  };

  activeSpeakTimer = window.setTimeout(launchQueue, 20);
}

export function speakHumanized(
  text: string,
  opts: {
    mood: AssistantMood;
    userEmotion: UserEmotion;
    emotionSettings: EmotionSettings;
    voiceSettings: VoiceSettings;
    preferNeural?: boolean;
    onStart?: () => void;
    onEnd?: () => void;
    onBlocked?: () => void;
    onAudioLevel?: (level: number) => void;
  }
): void {
  if (!opts.voiceSettings.voiceEnabled || !text.trim()) {
    opts.onEnd?.();
    return;
  }

  stopSpeaking();
  const sessionId = activeSpeakSession;
  const useNeural =
    (opts.preferNeural ?? opts.voiceSettings.liveVoiceMode) &&
    Date.now() >= neuralTtsCooldownUntil;

  if (useNeural) {
    void speakViaNeuralHumanTts(text, {
      sessionId,
      mood: opts.mood,
      voiceSettings: opts.voiceSettings,
      onStart: opts.onStart,
      onEnd: opts.onEnd,
      onAudioLevel: opts.onAudioLevel,
    }).then((ok) => {
      if (!ok && sessionId === activeSpeakSession) {
        speakWithBrowserSynthesisFallback(text, sessionId, opts);
      }
    });
    return;
  }

  speakWithBrowserSynthesisFallback(text, sessionId, opts);
}

export function playTactileChime(kind: 'listen' | 'confirm' | 'reminder' | 'sleep', enabled: boolean): void {
  if (!enabled || typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const freqs =
      kind === 'listen'
        ? [523.25, 659.25]
        : kind === 'sleep'
        ? [587.33, 440]
        : kind === 'reminder'
        ? [440, 554.37, 659.25]
        : [587.33, 783.99];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.035, now + idx * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.24);
    });
    setTimeout(() => {
      void ctx.close();
    }, 600);
  } catch {
    // AudioContext may be suspended before user gesture
  }
}

// ============================================================================
// Real-time Gemini Live Voice Client (16kHz PCM In -> 24kHz Gapless Audio Out)
// ============================================================================

function float32ToInt16Base64(float32: Float32Array, inputSampleRate: number): string {
  // Downsample to 16000Hz if needed
  const targetRate = 16000;
  let samples = float32;
  if (inputSampleRate > targetRate) {
    const ratio = inputSampleRate / targetRate;
    const newLen = Math.floor(float32.length / ratio);
    const downsampled = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      downsampled[i] = float32[Math.floor(i * ratio)];
    }
    samples = downsampled;
  }

  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Pcm24kToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000;
  }
  return float32;
}

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  isBuiltin: boolean;
  isBluetooth: boolean;
}

const BLUETOOTH_MIC_RE =
  /bluetooth|airpods|buds|headset|hands-free|handsfree|bth|wh-|wf-|jbl|boat|bose|sony|beats/i;
const BUILTIN_MIC_RE =
  /built-in|builtin|internal|macbook|realtek|array|laptop|integrated|intel|digital\s*mic|conexant|synaptics/i;

export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.enumerateDevices
  ) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput' && d.deviceId)
      .map((d, idx) => {
        const label = d.label?.trim() || `Microphone ${idx + 1}`;
        const isBluetooth = BLUETOOTH_MIC_RE.test(label);
        const isBuiltin = !isBluetooth && BUILTIN_MIC_RE.test(label);
        return {
          deviceId: d.deviceId,
          label,
          isBuiltin,
          isBluetooth,
        };
      });
  } catch {
    return [];
  }
}

export async function resolvePreferredMicConstraints(
  micMode = 'builtin'
): Promise<{ constraints: MediaTrackConstraints; label: string }> {
  const base: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  if (!micMode || micMode === 'auto') {
    return { constraints: base, label: 'System Default Mic' };
  }

  const inputs = await listAudioInputDevices();
  if (micMode !== 'builtin') {
    const exactMatch = inputs.find((d) => d.deviceId === micMode);
    if (exactMatch) {
      return {
        constraints: { ...base, deviceId: { ideal: exactMatch.deviceId } },
        label: exactMatch.label,
      };
    }
  }

  // Prefer laptop's built-in internal mic and skip Bluetooth headsets
  const builtin =
    inputs.find((d) => d.isBuiltin) ||
    inputs.find(
      (d) =>
        !d.isBluetooth &&
        d.deviceId !== 'default' &&
        d.deviceId !== 'communications'
    ) ||
    inputs.find((d) => !d.isBluetooth);

  if (builtin) {
    return {
      constraints: { ...base, deviceId: { ideal: builtin.deviceId } },
      label: builtin.label,
    };
  }

  return { constraints: base, label: 'Built-in Laptop Mic' };
}

export interface LiveVoiceController {
  stop: () => void;
  sendText: (text: string) => void;
  micActive: boolean;
  micLabel: string;
}

export async function startGeminiLiveVoice(options: {
  assistantName: string;
  callOwnerAs: string;
  languageMode: LanguageMode;
  mood: AssistantMood;
  voiceName?: string;
  customInstructions?: string;
  micMode?: string;
  onReady: (info?: { micActive: boolean; micLabel: string }) => void;
  onInputTranscript: (text: string) => void;
  onOutputTranscript: (text: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
  onAudioLevel: (level: number) => void;
  onError: (message: string) => void;
  onClose: () => void;
}): Promise<LiveVoiceController | null> {
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioCtx) {
    options.onError('Web Audio API unavailable.');
    return null;
  }

  let micStream: MediaStream | null = null;
  let inputCtx: AudioContext | null = null;
  let outputCtx: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let ws: WebSocket | null = null;
  let stopped = false;
  let micLabel = 'Speaker + Keyboard Mode (No Mic)';

  const activeSources = new Set<AudioBufferSourceNode>();
  let nextStartTime = 0;

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    activeSources.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    activeSources.clear();
    processor?.disconnect();
    micStream?.getTracks().forEach((t) => t.stop());
    if (inputCtx) void inputCtx.close();
    if (outputCtx) void outputCtx.close();
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
    options.onAudioLevel(0);
    options.onSpeakingChange(false);
    options.onClose();
  };

  try {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const resolved = await resolvePreferredMicConstraints(options.micMode);
        micStream = await navigator.mediaDevices.getUserMedia({ audio: resolved.constraints });
        micLabel = resolved.label;
      } catch {
        // Allow speaking via laptop speakers even when no microphone is available
        micStream = null;
      }
    }

    if (micStream) {
      inputCtx = new AudioCtx({ sampleRate: 16000 });
    }
    outputCtx = new AudioCtx({ sampleRate: 24000 });

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      assistantName: options.assistantName,
      callOwnerAs: options.callOwnerAs,
      languageMode: options.languageMode,
      mood: options.mood,
      voiceName: options.voiceName || 'Zephyr',
      customInstructions: options.customInstructions || '',
    });
    ws = new WebSocket(`${proto}//${window.location.host}/api/live?${params.toString()}`);

    ws.onmessage = (ev) => {
      if (stopped || !outputCtx) return;
      try {
        const msg = JSON.parse(String(ev.data)) as {
          ready?: boolean;
          audio?: string;
          inputTranscript?: string;
          outputTranscript?: string;
          interrupted?: boolean;
          error?: string;
        };

        if (msg.error) {
          options.onError(msg.error);
          cleanup();
          return;
        }
        if (msg.ready) {
          options.onReady({ micActive: Boolean(micStream), micLabel });
        }
        if (msg.inputTranscript) {
          options.onInputTranscript(msg.inputTranscript);
        }
        if (msg.outputTranscript) {
          options.onOutputTranscript(msg.outputTranscript);
        }
        if (msg.interrupted) {
          activeSources.forEach((src) => {
            try {
              src.stop();
            } catch {
              // ignore
            }
          });
          activeSources.clear();
          nextStartTime = outputCtx.currentTime;
          options.onSpeakingChange(false);
          options.onAudioLevel(0);
        }
        if (msg.audio) {
          const floatSamples = base64Pcm24kToFloat32(msg.audio);
          const buffer = outputCtx.createBuffer(1, floatSamples.length, 24000);
          buffer.getChannelData(0).set(floatSamples);

          const source = outputCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(outputCtx.destination);

          const startAt = Math.max(outputCtx.currentTime + 0.02, nextStartTime);
          nextStartTime = startAt + buffer.duration;
          activeSources.add(source);
          options.onSpeakingChange(true);

          // Estimate RMS amplitude for smooth 3D hologram reactivity
          let sumSq = 0;
          const step = Math.max(1, Math.floor(floatSamples.length / 64));
          for (let i = 0; i < floatSamples.length; i += step) {
            sumSq += floatSamples[i] * floatSamples[i];
          }
          const rms = Math.min(1, Math.sqrt(sumSq / 64) * 3.2);
          options.onAudioLevel(rms);

          source.onended = () => {
            activeSources.delete(source);
            if (activeSources.size === 0 && !stopped) {
              options.onSpeakingChange(false);
              options.onAudioLevel(0);
            }
          };
          source.start(startAt);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      options.onError('Live voice connection closed. Using local soft speech.');
      cleanup();
    };

    ws.onclose = () => {
      cleanup();
    };

    if (micStream && inputCtx) {
      const sourceNode = inputCtx.createMediaStreamSource(micStream);
      processor = inputCtx.createScriptProcessor(4096, 1, 1);
      sourceNode.connect(processor);
      processor.connect(inputCtx.destination);

      processor.onaudioprocess = (event) => {
        if (stopped || !ws || ws.readyState !== WebSocket.OPEN || !inputCtx) return;
        const inputData = event.inputBuffer.getChannelData(0);
        const b64 = float32ToInt16Base64(inputData, inputCtx.sampleRate);
        ws.send(JSON.stringify({ audio: b64 }));
      };
    }

    return {
      stop: cleanup,
      sendText: (text: string) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ text }));
        }
      },
      micActive: Boolean(micStream),
      micLabel,
    };
  } catch {
    options.onError('Could not open live voice session. Using local soft voice.');
    cleanup();
    return null;
  }
}

export async function captureVoiceSample(options: {
  durationMs?: number;
  micMode?: string;
  onLevel?: (level: number) => void;
}): Promise<{ signature: VoiceprintSignature | null; error?: string }> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    return {
      signature: null,
      error: 'Microphone hardware is unavailable in this environment. Use your Personal PIN as backup.',
    };
  }

  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;

  try {
    const resolved = await resolvePreferredMicConstraints(options.micMode);
    stream = await navigator.mediaDevices.getUserMedia({ audio: resolved.constraints });
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return { signature: null, error: 'Web Audio API unavailable.' };
    }
    ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const frames: number[][] = [];
    const duration = options.durationMs ?? 2400;
    const started = Date.now();

    await new Promise<void>((resolve) => {
      const interval = window.setInterval(() => {
        analyser.getByteFrequencyData(freqData);
        const frame = Array.from(freqData);
        frames.push(frame);

        let sum = 0;
        for (let i = 0; i < 64; i++) sum += frame[i];
        options.onLevel?.(Math.min(1, sum / (64 * 128)));

        if (Date.now() - started >= duration) {
          window.clearInterval(interval);
          resolve();
        }
      }, 60);
    });

    const signature = computeSpectralSignature(frames, ctx.sampleRate, analyser.fftSize);
    if (!signature) {
      return {
        signature: null,
        error: 'No voice audio detected. Speak clearly closer to the mic or use PIN backup.',
      };
    }
    return { signature };
  } catch {
    return {
      signature: null,
      error: 'Microphone access denied or unavailable. Your Personal PIN remains active.',
    };
  } finally {
    options.onLevel?.(0);
    stream?.getTracks().forEach((t) => t.stop());
    if (ctx) {
      void ctx.close();
    }
  }
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

let activeRecognitionPauseHandler: ((paused: boolean) => void) | null = null;

export function setVoiceCapturePaused(paused: boolean): void {
  activeRecognitionPauseHandler?.(paused);
}

export function startVoiceCapture(options: {
  continuous: boolean;
  lang?: string;
  onInterim: (transcript: string, alternatives?: string[]) => void;
  onFinal: (transcript: string, alternatives?: string[]) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): () => void {
  if (typeof window === 'undefined') {
    options.onEnd();
    return () => {};
  }

  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;

  let stoppedByCaller = false;
  let pausedForSpeech = false;
  let recognition: SpeechRecognitionLike | null = null;
  let retryTimer: number | null = null;

  const onSyntheticSpeech = (ev: Event) => {
    if (stoppedByCaller || pausedForSpeech) return;
    const detail = (ev as CustomEvent<{ text?: string; alternatives?: string[]; isFinal?: boolean }>).detail;
    const text = detail?.text?.trim();
    if (!text) return;
    const alts = detail?.alternatives?.length ? detail.alternatives : [text];
    if (detail?.isFinal) {
      options.onFinal(text, alts);
    } else {
      options.onInterim(text, alts);
    }
  };
  window.addEventListener('jarvis:speech-transcript', onSyntheticSpeech);

  if (!Ctor) {
    options.onError(
      'Voice recognition is unavailable in this browser engine. Type below or open in Chrome / Safari.'
    );
    options.onEnd();
    return () => {
      stoppedByCaller = true;
      window.removeEventListener('jarvis:speech-transcript', onSyntheticSpeech);
    };
  }

  const scheduleRestart = (delayMs: number) => {
    if (stoppedByCaller || !options.continuous) {
      options.onEnd();
      return;
    }
    if (pausedForSpeech) return;
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
    }
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      launch();
    }, delayMs);
  };

  const launch = () => {
    if (stoppedByCaller || pausedForSpeech) return;
    recognition = new Ctor();
    recognition.continuous = options.continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = options.lang ?? 'en-IN';

    recognition.onresult = (event) => {
      let interim = '';
      const interimAlts: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const altTexts: string[] = [];
        const altCount = Math.min(3, (result as unknown as { length?: number }).length || 1);
        for (let a = 0; a < altCount; a++) {
          const t = (result as unknown as Record<number, SpeechRecognitionAlternativeLike | undefined>)[a]?.transcript?.trim();
          if (t && !altTexts.includes(t)) altTexts.push(t);
        }
        const text = altTexts[0] ?? result[0]?.transcript ?? '';
        if (result.isFinal) {
          if (text.trim()) options.onFinal(text.trim(), altTexts);
        } else {
          interim += text;
          altTexts.forEach((a) => {
            if (!interimAlts.includes(a)) interimAlts.push(a);
          });
        }
      }
      if (interim.trim()) {
        options.onInterim(interim.trim(), interimAlts.length ? interimAlts : [interim.trim()]);
      }
    };

    recognition.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        stoppedByCaller = true;
        options.onError('Microphone permission was denied. Enable mic access in browser settings.');
      } else if (ev.error === 'network' || ev.error === 'audio-capture') {
        if (!options.continuous) {
          options.onError(`Voice capture paused (${ev.error}).`);
        }
      }
    };

    recognition.onend = () => {
      if (pausedForSpeech) return;
      scheduleRestart(60);
    };

    try {
      recognition.start();
    } catch {
      if (options.continuous && !stoppedByCaller && !pausedForSpeech) {
        scheduleRestart(350);
      } else if (!pausedForSpeech) {
        options.onError('Could not start microphone capture right now.');
        options.onEnd();
      }
    }
  };

  activeRecognitionPauseHandler = (paused: boolean) => {
    if (stoppedByCaller || pausedForSpeech === paused) return;
    pausedForSpeech = paused;
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (paused) {
      try {
        recognition?.stop();
      } catch {
        // ignore
      }
    } else {
      scheduleRestart(180);
    }
  };

  launch();

  return () => {
    stoppedByCaller = true;
    activeRecognitionPauseHandler = null;
    window.removeEventListener('jarvis:speech-transcript', onSyntheticSpeech);
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    try {
      recognition?.stop();
    } catch {
      // ignore
    }
  };
}
