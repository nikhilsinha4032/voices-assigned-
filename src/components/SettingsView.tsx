import React, { useRef, useState } from 'react';
import { Download, Heart, Lock, Mic, ShieldCheck, Upload, Volume2 } from 'lucide-react';
import { computeEmotionalProsody, describeAssistantFeeling } from '../engine/emotion';
import { hashPin } from '../engine/voiceprint';
import { captureVoiceSample, type LocalVoiceOption } from '../services/voice';
import type {
  AssistantMood,
  AssistantState,
  EmotionSettings,
  FormalityLevel,
  LanguageMode,
  OwnerProfile,
  PersonaTemperament,
  VoiceSettings,
} from '../types/assistant';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  state: AssistantState;
  availableVoices: LocalVoiceOption[];
  isSpeaking: boolean;
  onUpdateOwnerProfile: (patch: Partial<OwnerProfile>) => void;
  onUpdateEmotionSettings: (patch: Partial<EmotionSettings>) => void;
  onSetMood: (mood: AssistantMood) => void;
  onUpdateVoiceSettings: (patch: Partial<VoiceSettings>) => void;
  onTestVoice: () => void;
  onReopenOnboarding: () => void;
  onExportBackup: () => void;
  onImportBackup: (jsonText: string) => boolean;
  onResetDefaults: () => void;
}

const TEMPERAMENTS: Array<{
  id: PersonaTemperament;
  title: string;
  desc: string;
}> = [
  {
    id: 'warm-companion',
    title: 'Warm Companion',
    desc: 'Attentive, natural, and emotionally supportive in everyday conversation.',
  },
  {
    id: 'calm-concierge',
    title: 'Calm Concierge',
    desc: 'Steady, composed, and unhurried—ideal for peaceful home routines.',
  },
  {
    id: 'upbeat-coach',
    title: 'Upbeat Coach',
    desc: 'Encouraging and celebratory when you complete tasks and build habits.',
  },
  {
    id: 'crisp-executive',
    title: 'Crisp Executive',
    desc: 'Brief, focused, and direct while respecting emotional cues.',
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  state,
  availableVoices,
  isSpeaking,
  onUpdateOwnerProfile,
  onUpdateEmotionSettings,
  onSetMood,
  onUpdateVoiceSettings,
  onTestVoice,
  onReopenOnboarding,
  onExportBackup,
  onImportBackup,
  onResetDefaults,
}) => {
  const { ownerProfile, emotionSettings, voiceSettings, currentMood } = state;
  const feeling = describeAssistantFeeling(currentMood, emotionSettings);
  const prosody = computeEmotionalProsody(currentMood, 'neutral', emotionSettings, voiceSettings);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinSavedMsg, setPinSavedMsg] = useState<string | null>(null);
  const [enrollingVoice, setEnrollingVoice] = useState(false);
  const [voiceEnrollMsg, setVoiceEnrollMsg] = useState<string | null>(null);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = onImportBackup(String(reader.result ?? ''));
      setImportStatus(
        ok ? 'Local backup restored cleanly.' : 'Invalid backup file. No data was changed.'
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePinSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) {
      setPinSavedMsg('Enter exactly 4 digits for your private PIN.');
      return;
    }
    onUpdateOwnerProfile({ pinHash: hashPin(newPin) });
    setNewPin('');
    setPinSavedMsg('Private PIN updated locally.');
  };

  const handleEnrollVoiceprint = async () => {
    setEnrollingVoice(true);
    setVoiceEnrollMsg('Listening for 2.4s... Speak naturally into your microphone.');
    const res = await captureVoiceSample({ durationMs: 2400 });
    setEnrollingVoice(false);
    if (res.signature) {
      onUpdateOwnerProfile({ voiceprint: res.signature });
      setVoiceEnrollMsg(
        `Voiceprint enrolled (${res.signature.centroidHz} Hz profile). Ready for voice unlock.`
      );
    } else {
      setVoiceEnrollMsg(res.error ?? 'Could not access microphone.');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Feelings & Emotional Intelligence Settings */}
      <section
        aria-label="Feelings and emotional intelligence settings"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-6 dark:border-sky-500/20 dark:bg-[#081020]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Feelings & Emotional Intelligence
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Shape how {ownerProfile.assistantName} reads your tone, adapts its feelings, and speaks with you.
            </p>
          </div>
          <Heart className="h-5 w-5 shrink-0 text-blue-700 dark:text-sky-400" aria-hidden="true" />
        </div>

        <div className="mt-4 rounded-xl bg-slate-100/80 p-4 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Current Emotional State
            </span>
            <span className="text-xs font-semibold text-blue-700 dark:text-sky-400">
              {feeling.label}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">{feeling.reflection}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['warm', 'empathetic', 'serene', 'encouraging', 'focused', 'playful'] as const).map(
              (m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSetMood(m)}
                  className={`min-h-[36px] rounded-lg px-2 py-1 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                    currentMood === m
                      ? 'bg-slate-900 text-white dark:bg-sky-600 dark:text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {m}
                </button>
              )
            )}
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Persona Temperament
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {TEMPERAMENTS.map((item) => {
                const active = emotionSettings.temperament === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUpdateEmotionSettings({ temperament: item.id })}
                    className={`rounded-xl p-3 text-left transition-colors ${
                      active
                        ? 'bg-blue-50 ring-2 ring-blue-700 dark:bg-sky-950/50 dark:ring-sky-400'
                        : 'bg-slate-100/80 hover:bg-slate-200/60 dark:bg-slate-900/70 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-xs leading-snug text-slate-600 dark:text-slate-400">
                      {item.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="eq-empathy-slider"
                className="font-medium text-slate-700 dark:text-slate-300"
              >
                Empathy & Warmth
              </label>
              <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                {emotionSettings.empathyLevel}%
              </span>
            </div>
            <input
              id="eq-empathy-slider"
              type="range"
              min={0}
              max={100}
              value={emotionSettings.empathyLevel}
              onChange={(e) => onUpdateEmotionSettings({ empathyLevel: Number(e.target.value) })}
              className="mt-2 h-2 w-full cursor-pointer accent-blue-700 dark:accent-sky-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="eq-expressiveness-slider"
                className="font-medium text-slate-700 dark:text-slate-300"
              >
                Emotional Expressiveness
              </label>
              <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                {emotionSettings.expressiveness}%
              </span>
            </div>
            <input
              id="eq-expressiveness-slider"
              type="range"
              min={0}
              max={100}
              value={emotionSettings.expressiveness}
              onChange={(e) => onUpdateEmotionSettings({ expressiveness: Number(e.target.value) })}
              className="mt-2 h-2 w-full cursor-pointer accent-blue-700 dark:accent-sky-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Conversational Formality
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose casual familiarity or polite distance
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
              {(['casual', 'balanced', 'formal'] as FormalityLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onUpdateEmotionSettings({ formality: lvl })}
                  className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    emotionSettings.formality === lvl
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-sky-600 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Proactive Care & Check-Ins
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Offers gentle breaks when you sound stressed or overloaded
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={emotionSettings.proactiveCare}
              aria-label="Toggle proactive care check-ins"
              onClick={() =>
                onUpdateEmotionSettings({ proactiveCare: !emotionSettings.proactiveCare })
              }
              className={`min-h-[40px] rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                emotionSettings.proactiveCare
                  ? 'bg-blue-700 text-white dark:bg-sky-600'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {emotionSettings.proactiveCare ? 'Enabled' : 'Off'}
            </button>
          </div>
        </div>
      </section>

      {/* Right Column: Private Owner Lock + Human Voice Synthesis + Privacy Vault */}
      <div className="space-y-6 lg:col-span-6">
        {/* Exclusive Owner Security & Personalization */}
        <section
          aria-label="Private owner identity and voice recognition lock"
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-sky-500/20 dark:bg-[#081020]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Personal Identity & Voice Lock
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Restricted strictly to {ownerProfile.ownerName} via local voiceprint & 4-digit PIN
              </p>
            </div>
            <Lock className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="owner-ai-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                AI Name
              </label>
              <input
                id="owner-ai-name"
                type="text"
                value={ownerProfile.assistantName}
                onChange={(e) => onUpdateOwnerProfile({ assistantName: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#050A14] dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="owner-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Owner Name
              </label>
              <input
                id="owner-name"
                type="text"
                value={ownerProfile.ownerName}
                onChange={(e) => {
                  onUpdateOwnerProfile({ ownerName: e.target.value });
                  onUpdateEmotionSettings({ userName: e.target.value });
                }}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#050A14] dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="owner-call-as" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Call You As
              </label>
              <input
                id="owner-call-as"
                type="text"
                value={ownerProfile.callOwnerAs}
                onChange={(e) => onUpdateOwnerProfile({ callOwnerAs: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#050A14] dark:text-slate-100"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-100/80 p-3.5 dark:bg-slate-900/70">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Local Voiceprint Profile
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {ownerProfile.voiceprint
                  ? `Active (${ownerProfile.voiceprint.centroidHz} Hz spectral signature)`
                  : 'Not enrolled yet — record 2.4s to unlock by voice'}
              </p>
            </div>
            <button
              type="button"
              disabled={enrollingVoice}
              onClick={() => void handleEnrollVoiceprint()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
              <span>
                {enrollingVoice
                  ? 'Listening...'
                  : ownerProfile.voiceprint
                  ? 'Re-enroll Voice'
                  : 'Enroll Voiceprint'}
              </span>
            </button>
          </div>
          {voiceEnrollMsg && (
            <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">{voiceEnrollMsg}</p>
          )}

          <form onSubmit={handlePinSave} className="mt-4 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label htmlFor="settings-pin-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Update 4-Digit Owner PIN
              </label>
              <input
                id="settings-pin-input"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="New 4-digit PIN"
                className="font-mono-tabular mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#050A14] dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              Save PIN
            </button>
            <button
              type="button"
              onClick={onReopenOnboarding}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Run Setup Wizard
            </button>
          </form>
          {pinSavedMsg && <p className="mt-2 text-xs text-teal-700 dark:text-teal-400">{pinSavedMsg}</p>}
        </section>

        {/* Human Voice Synthesis */}
        <section
          aria-label="Human voice synthesis settings"
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-sky-500/20 dark:bg-[#081020]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Human Voice Synthesis
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                On-device speech synthesis with Hinglish / Hindi / English prosody
              </p>
            </div>
            <button
              type="button"
              onClick={onTestVoice}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 whitespace-nowrap shrink-0"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              <span>{isSpeaking ? 'Speaking...' : 'Test Voice'}</span>
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="voice-selector"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  On-Device Voice Profile
                </label>
                <select
                  id="voice-selector"
                  value={voiceSettings.voiceURI}
                  onChange={(e) => onUpdateVoiceSettings({ voiceURI: e.target.value })}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#050A14] dark:text-slate-100"
                >
                  <option value="auto">Automatic Best Local Voice</option>
                  {availableVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang}){v.localService ? ' · Offline' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="speech-lang-selector"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Voice Recognition Accent
                </label>
                <select
                  id="speech-lang-selector"
                  value={voiceSettings.speechLang}
                  onChange={(e) => {
                    const speechLang = e.target.value as VoiceSettings['speechLang'];
                    const languageMode: LanguageMode =
                      speechLang === 'hi-IN'
                        ? 'hindi'
                        : speechLang === 'en-IN'
                        ? 'hinglish'
                        : 'english';
                    onUpdateVoiceSettings({ speechLang });
                    onUpdateOwnerProfile({ languageMode });
                  }}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#050A14] dark:text-slate-100"
                >
                  <option value="en-IN">Hinglish / Indian English (en-IN)</option>
                  <option value="hi-IN">Hindi (hi-IN)</option>
                  <option value="en-US">English (en-US)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="voice-rate-slider"
                    className="font-medium text-slate-700 dark:text-slate-300"
                  >
                    Speaking Pace
                  </label>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                    {voiceSettings.rate.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="voice-rate-slider"
                  type="range"
                  min={0.75}
                  max={1.35}
                  step={0.05}
                  value={voiceSettings.rate}
                  onChange={(e) => onUpdateVoiceSettings({ rate: Number(e.target.value) })}
                  className="mt-2 h-2 w-full cursor-pointer accent-blue-700 dark:accent-sky-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="voice-pitch-slider"
                    className="font-medium text-slate-700 dark:text-slate-300"
                  >
                    Voice Warmth / Pitch
                  </label>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                    {voiceSettings.pitch.toFixed(2)}
                  </span>
                </div>
                <input
                  id="voice-pitch-slider"
                  type="range"
                  min={0.8}
                  max={1.25}
                  step={0.02}
                  value={voiceSettings.pitch}
                  onChange={(e) => onUpdateVoiceSettings({ pitch: Number(e.target.value) })}
                  className="mt-2 h-2 w-full cursor-pointer accent-blue-700 dark:accent-sky-500"
                />
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Auto-Speak Assistant Replies
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Speaks responses aloud automatically after commands
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={voiceSettings.autoSpeakReplies}
                  aria-label="Toggle auto-speak replies"
                  onClick={() =>
                    onUpdateVoiceSettings({ autoSpeakReplies: !voiceSettings.autoSpeakReplies })
                  }
                  className={`min-h-[40px] rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    voiceSettings.autoSpeakReplies
                      ? 'bg-blue-700 text-white dark:bg-sky-600'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {voiceSettings.autoSpeakReplies ? 'On' : 'Off'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Emotional Prosody Shaping
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    Active modulation: {prosody.rate}x pace · {prosody.pitch} pitch · {prosody.pauseStyle} cadence
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={voiceSettings.emotionalProsody}
                  aria-label="Toggle emotional prosody shaping"
                  onClick={() =>
                    onUpdateVoiceSettings({ emotionalProsody: !voiceSettings.emotionalProsody })
                  }
                  className={`min-h-[40px] rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    voiceSettings.emotionalProsody
                      ? 'bg-blue-700 text-white dark:bg-sky-600'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {voiceSettings.emotionalProsody ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Zero-Cloud Privacy Vault & Mobile Install */}
        <section
          aria-label="Local privacy vault and mobile app installation"
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-sky-500/20 dark:bg-[#081020]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Zero-Cloud Privacy & Mobile App
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                All NLU, voiceprints, routines, tasks, and smart home state remain strictly on your device.
              </p>
            </div>
            <ShieldCheck
              className="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-400"
              aria-hidden="true"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <PWAInstallButton />
            <button
              type="button"
              onClick={onExportBackup}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Export Local Backup</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>Restore Backup</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleFileImport}
              className="hidden"
              aria-label="Restore local backup file"
            />
          </div>

          {importStatus && (
            <p className="mt-2.5 text-xs text-teal-700 dark:text-teal-400">{importStatus}</p>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Reset tasks, routines, devices, and EQ to clean defaults
            </span>
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="min-h-[40px] rounded-xl px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 whitespace-nowrap shrink-0"
              >
                Reset Local Data
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetDefaults();
                    setConfirmReset(false);
                  }}
                  className="min-h-[40px] rounded-xl bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap shrink-0"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="min-h-[40px] rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
