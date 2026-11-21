import React, { useState } from 'react';
import { Lock, Mic, Unlock } from 'lucide-react';
import { matchVoiceprint, verifyPin } from '../engine/voiceprint';
import { captureVoiceSample } from '../services/voice';
import type { OwnerProfile } from '../types/assistant';
import { JarvisHologram3D } from './JarvisHologram3D';

interface OwnerLockGateProps {
  ownerProfile: OwnerProfile;
  onUnlock: () => void;
}

export const OwnerLockGate: React.FC<OwnerLockGateProps> = ({ ownerProfile, onUnlock }) => {
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [verifyingVoice, setVerifyingVoice] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyPin(pinInput, ownerProfile.pinHash)) {
      setError('');
      onUnlock();
    } else {
      setError('Incorrect PIN. Access is restricted to the owner.');
      setPinInput('');
    }
  };

  const handleVoiceUnlock = async () => {
    if (!ownerProfile.voiceprint) {
      setVoiceFeedback('No voiceprint enrolled yet. Unlock with your 4-digit PIN.');
      return;
    }
    setVerifyingVoice(true);
    setVoiceFeedback('Speak to verify your voiceprint...');
    const sample = await captureVoiceSample({
      durationMs: 2200,
      onLevel: (l) => setVoiceLevel(l),
    });
    setVerifyingVoice(false);
    setVoiceLevel(0);

    if (!sample.signature) {
      setVoiceFeedback(sample.error ?? 'Could not capture voice. Use your PIN below.');
      return;
    }

    const res = matchVoiceprint(ownerProfile.voiceprint, sample.signature);
    if (res.matched) {
      setVoiceFeedback(`Voice verified (${Math.round(res.confidence * 100)}% match).`);
      onUnlock();
    } else {
      setVoiceFeedback(
        `Voice did not match owner profile (${Math.round(res.confidence * 100)}% similarity). Use PIN.`
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050A14] px-4 py-8 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-amber-500/25 bg-[#081020] p-6 text-center shadow-2xl sm:p-8">
        <div className="flex justify-center">
          <JarvisHologram3D
            isActivated={false}
            isListening={verifyingVoice}
            isSpeaking={false}
            isLocked
            mood="focused"
            audioLevel={voiceLevel}
            className="h-[210px] w-full max-w-[240px] rounded-2xl"
            label="JARVIS locked sentinel 3D core"
          />
        </div>

        <div className="mt-2 flex items-center justify-center gap-2 text-xs font-medium text-amber-400">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Private Owner Lock · {ownerProfile.assistantName}</span>
        </div>

        <h1 className="mt-2 font-display text-2xl font-bold text-white">
          Locked for {ownerProfile.ownerName}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          This assistant responds exclusively to you. Verify your voice or enter your private PIN.
        </p>

        {ownerProfile.voiceprint && (
          <div className="mt-5">
            <button
              type="button"
              disabled={verifyingVoice}
              onClick={() => void handleVoiceUnlock()}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
              <span>{verifyingVoice ? 'Verifying Voice...' : 'Unlock with My Voice'}</span>
            </button>
            {voiceFeedback && (
              <p className="mt-2 text-xs text-sky-300">{voiceFeedback}</p>
            )}
          </div>
        )}

        <form onSubmit={handlePinSubmit} className="mt-5 space-y-3 border-t border-slate-800 pt-5">
          <label htmlFor="unlock-pin-input" className="block text-xs font-medium text-slate-400">
            Enter 4-Digit Owner PIN
          </label>
          <input
            id="unlock-pin-input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            className="font-mono-tabular min-h-[48px] w-full rounded-xl border border-slate-700 bg-[#050A14] px-4 py-2.5 text-center text-xl tracking-[0.5em] text-white focus:border-sky-400 focus:outline-none"
          />
          {error && (
            <p role="alert" className="text-xs text-amber-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <Unlock className="h-4 w-4" aria-hidden="true" />
            <span>Unlock {ownerProfile.assistantName}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
