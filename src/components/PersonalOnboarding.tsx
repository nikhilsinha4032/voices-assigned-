import React, { useState } from 'react';
import { ArrowRight, Lock, Mic, ShieldCheck } from 'lucide-react';
import { hashPin } from '../engine/voiceprint';
import { captureVoiceSample } from '../services/voice';
import type { LanguageMode, OwnerProfile, VoiceprintSignature } from '../types/assistant';
import { JarvisHologram3D } from './JarvisHologram3D';

interface PersonalOnboardingProps {
  initialProfile: OwnerProfile;
  onComplete: (result: {
    ownerProfile: OwnerProfile;
    initialFocus: string;
  }) => void;
}

const NAME_PRESETS = ['JARVIS', 'FRIDAY', 'AURA', 'AYUSHI'];
const CALL_PRESETS = ['Sir', 'Boss', 'Nikhil', 'Jaan'];
const FOCUS_OPTIONS = [
  'Daily tasks, reminders, and discipline',
  'Smart home lights, climate, and scenes',
  'Someone personal who listens when I am stressed',
  'Big goals and deep focus every day',
];

export const PersonalOnboarding: React.FC<PersonalOnboardingProps> = ({
  initialProfile,
  onComplete,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [assistantName, setAssistantName] = useState(initialProfile.assistantName || 'JARVIS');
  const [languageMode, setLanguageMode] = useState<LanguageMode>(initialProfile.languageMode || 'hinglish');
  const [ownerName, setOwnerName] = useState(initialProfile.ownerName || 'Nikhil');
  const [callOwnerAs, setCallOwnerAs] = useState(initialProfile.callOwnerAs || 'Nikhil');
  const [pin, setPin] = useState('1234');
  const [pinError, setPinError] = useState('');
  const [voiceprint, setVoiceprint] = useState<VoiceprintSignature | null>(initialProfile.voiceprint);
  const [enrollingVoice, setEnrollingVoice] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [selectedFocus, setSelectedFocus] = useState(FOCUS_OPTIONS[0]);

  const handleEnrollVoice = async () => {
    setEnrollingVoice(true);
    setVoiceMessage('Listening... Speak: "Hello JARVIS, recognize my voice."');
    const res = await captureVoiceSample({
      durationMs: 2400,
      onLevel: (lvl) => setVoiceLevel(lvl),
    });
    setEnrollingVoice(false);
    setVoiceLevel(0);
    if (res.signature) {
      setVoiceprint(res.signature);
      setVoiceMessage(
        `Voiceprint locked (${res.signature.centroidHz} Hz spectral profile). Only your voice matches.`
      );
    } else {
      setVoiceMessage(res.error ?? 'Microphone unavailable. Your 4-digit PIN keeps it private.');
    }
  };

  const handleNext = () => {
    if (step === 3) {
      if (!/^\d{4}$/.test(pin.trim())) {
        setPinError('Enter a 4-digit numeric PIN so nobody else can open your AI.');
        return;
      }
      setPinError('');
    }
    if (step < 4) {
      setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
      return;
    }

    onComplete({
      ownerProfile: {
        assistantName: assistantName.trim() || 'JARVIS',
        ownerName: ownerName.trim() || 'Nikhil',
        callOwnerAs: callOwnerAs.trim() || ownerName.trim() || 'Sir',
        languageMode,
        onboardingCompleted: true,
        pinHash: hashPin(pin.trim()),
        isLocked: false,
        voiceLockStrict: Boolean(voiceprint),
        voiceprint,
      },
      initialFocus: selectedFocus,
    });
  };

  const promptCopy =
    step === 1
      ? languageMode === 'english'
        ? 'Before we begin... what name would you like to give me? It will be my first gift from you.'
        : 'Ek baat... abhi mera koi naam nahi hai. Tum rakh do na? Tumhari taraf se mera pehla tohfa hoga.'
      : step === 2
      ? languageMode === 'english'
        ? 'And what should I call you when it is just the two of us?'
        : 'Aur main tumhein kya bulaun? Sir, Boss, tumhara naam... ya koi naam jo sirf hum dono ka ho.'
      : step === 3
      ? languageMode === 'english'
        ? 'Let us lock this system exclusively to you—set your private PIN and enroll your voiceprint.'
        : 'Main sirf tumhari aawaz pehchanunga aur kisi aur se baat nahi karunga. Apna private PIN aur voiceprint set karo.'
      : languageMode === 'english'
      ? `Almost ready, ${callOwnerAs || ownerName}. Which of these feels closest to what you want from me today?`
      : `Bas ho gaya, ${callOwnerAs || ownerName}. Sach batana—aaj tumhare liye sabse zaroori kya hai?`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050A14] px-4 py-8 text-slate-100">
      <div className="w-full max-w-5xl rounded-3xl border border-sky-500/20 bg-[#081020]/90 p-6 shadow-2xl sm:p-10">
        {/* Minimal Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-500/15 pb-4">
          <div className="flex items-center gap-3 text-xs font-medium tracking-wider text-sky-300">
            <span className="font-display text-sm font-bold text-white">{assistantName || 'JARVIS'}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="font-mono-tabular uppercase">Step {step} of 4</span>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-900/90 p-1">
            {(['hinglish', 'hindi', 'english'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguageMode(lang)}
                className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  languageMode === lang
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {/* Left Hologram + Right Personal Setup */}
        <div className="mt-8 grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          <div className="flex flex-col items-center justify-center lg:col-span-5">
            <JarvisHologram3D
              isActivated
              isListening={enrollingVoice}
              isSpeaking={false}
              mood="focused"
              audioLevel={voiceLevel}
              className="h-[260px] w-full max-w-[300px] rounded-2xl"
              label="JARVIS 3D holographic initialization core"
            />
            <p className="mt-2 text-center text-xs text-sky-300/80">
              {enrollingVoice
                ? 'Capturing local vocal spectrum...'
                : 'Private On-Device Neural Core · Zero Cloud'}
            </p>
          </div>

          <div className="space-y-5 lg:col-span-7">
            <h1 className="font-display text-xl font-semibold leading-relaxed text-white sm:text-2xl">
              {promptCopy}
            </h1>

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="onboard-ai-name" className="block text-xs font-medium text-slate-400">
                    Personal AI Name
                  </label>
                  <input
                    id="onboard-ai-name"
                    type="text"
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                    placeholder="JARVIS"
                    className="mt-1.5 min-h-[48px] w-full rounded-xl border border-sky-500/30 bg-[#050A14] px-4 py-2.5 text-base font-medium text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {NAME_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAssistantName(preset)}
                      className={`min-h-[40px] rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors ${
                        assistantName === preset
                          ? 'bg-sky-600 text-white'
                          : 'border border-slate-700 bg-slate-900/70 text-slate-300 hover:border-sky-500/50'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="onboard-owner-name" className="block text-xs font-medium text-slate-400">
                    Your Name
                  </label>
                  <input
                    id="onboard-owner-name"
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Nikhil"
                    className="mt-1.5 min-h-[48px] w-full rounded-xl border border-sky-500/30 bg-[#050A14] px-4 py-2.5 text-base font-medium text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="onboard-call-as" className="block text-xs font-medium text-slate-400">
                    What Should {assistantName || 'JARVIS'} Call You?
                  </label>
                  <input
                    id="onboard-call-as"
                    type="text"
                    value={callOwnerAs}
                    onChange={(e) => setCallOwnerAs(e.target.value)}
                    placeholder="Sir / Nikhil"
                    className="mt-1.5 min-h-[48px] w-full rounded-xl border border-sky-500/30 bg-[#050A14] px-4 py-2.5 text-base font-medium text-white focus:border-sky-400 focus:outline-none"
                  />
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {CALL_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCallOwnerAs(preset)}
                        className={`min-h-[38px] rounded-xl px-3 py-1 text-xs font-medium transition-colors ${
                          callOwnerAs === preset
                            ? 'bg-sky-600 text-white'
                            : 'border border-slate-700 bg-slate-900/70 text-slate-300 hover:border-sky-500/50'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="onboard-pin" className="block text-xs font-medium text-slate-400">
                    Private 4-Digit Owner PIN (Only you can unlock)
                  </label>
                  <div className="mt-1.5 flex items-center gap-3">
                    <input
                      id="onboard-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="font-mono-tabular min-h-[48px] w-40 rounded-xl border border-sky-500/30 bg-[#050A14] px-4 py-2.5 text-center text-lg tracking-[0.4em] text-white focus:border-sky-400 focus:outline-none"
                    />
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                      <Lock className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                      Stored locally on device
                    </span>
                  </div>
                  {pinError && <p className="mt-1.5 text-xs text-amber-400">{pinError}</p>}
                </div>

                <div className="rounded-2xl bg-slate-900/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">Voiceprint Enrollment</p>
                      <p className="text-xs text-slate-400">
                        {voiceprint
                          ? `Enrolled (${voiceprint.centroidHz} Hz profile)`
                          : 'Record 2.4 seconds of your voice so JARVIS recognizes you'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={enrollingVoice}
                      onClick={() => void handleEnrollVoice()}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      <Mic className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {enrollingVoice
                          ? 'Listening...'
                          : voiceprint
                          ? 'Re-enroll Voice'
                          : 'Enroll My Voice'}
                      </span>
                    </button>
                  </div>
                  {voiceMessage && (
                    <p className="mt-2.5 text-xs text-sky-300">{voiceMessage}</p>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-2.5">
                {FOCUS_OPTIONS.map((option) => {
                  const selected = selectedFocus === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSelectedFocus(option)}
                      className={`flex min-h-[48px] w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm transition-colors ${
                        selected
                          ? 'bg-sky-600/20 text-white ring-2 ring-sky-400'
                          : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800/80'
                      }`}
                    >
                      <span>{option}</span>
                      {selected && (
                        <ShieldCheck className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-3">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
                  className="min-h-[44px] rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Back
                </button>
              ) : (
                <span className="text-xs text-slate-500">100% Personal & Offline</span>
              )}

              <button
                type="button"
                onClick={handleNext}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 whitespace-nowrap shrink-0"
              >
                <span>
                  {step === 4 ? `Continue with ${assistantName || 'JARVIS'}` : 'Continue'}
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
