import React, { useEffect, useRef, useState } from 'react';
import { Download, Lock, Mic, RefreshCw, RotateCcw, Upload, Volume2, X } from 'lucide-react';
import { hashPin } from '../engine/voiceprint';
import {
  type AudioInputDevice,
  captureVoiceSample,
  listAudioInputDevices,
  type LocalVoiceOption,
} from '../services/voice';
import type {
  AssistantState,
  LanguageMode,
  OwnerProfile,
  VoiceSettings,
} from '../types/assistant';

interface QuickSettingsModalProps {
  open: boolean;
  onClose: () => void;
  powerEnabled: boolean;
  onTogglePower: (enabled: boolean) => void;
  ownerProfile: OwnerProfile;
  voiceSettings: VoiceSettings;
  fullState: AssistantState;
  availableVoices: LocalVoiceOption[];
  liveApiReady: boolean;
  onUpdateOwnerProfile: (patch: Partial<OwnerProfile>) => void;
  onUpdateVoiceSettings: (patch: Partial<VoiceSettings>) => void;
  onImportConfig: (imported: Partial<AssistantState>) => void;
  onTestVoice: () => void;
  onReopenOnboarding: () => void;
}

export const QuickSettingsModal: React.FC<QuickSettingsModalProps> = ({
  open,
  onClose,
  powerEnabled,
  onTogglePower,
  ownerProfile,
  voiceSettings,
  fullState,
  availableVoices,
  liveApiReady,
  onUpdateOwnerProfile,
  onUpdateVoiceSettings,
  onImportConfig,
  onTestVoice,
  onReopenOnboarding,
}) => {
  const [newPin, setNewPin] = useState('');
  const [pinSavedMsg, setPinSavedMsg] = useState<string | null>(null);
  const [enrollingVoice, setEnrollingVoice] = useState(false);
  const [voiceEnrollMsg, setVoiceEnrollMsg] = useState<string | null>(null);
  const [micDevices, setMicDevices] = useState<AudioInputDevice[]>([]);
  const [configMsg, setConfigMsg] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const refreshMics = () => {
    void listAudioInputDevices().then(setMicDevices);
  };

  useEffect(() => {
    if (open) {
      refreshMics();
      setConfigMsg(null);
    }
  }, [open]);

  if (!open) return null;

  const handleEnrollVoice = async () => {
    setEnrollingVoice(true);
    setVoiceEnrollMsg('Speak for 2.4 seconds: "Hey JARVIS, recognize my voice."');
    const res = await captureVoiceSample({
      durationMs: 2400,
      micMode: voiceSettings.micMode,
    });
    setEnrollingVoice(false);
    refreshMics();
    if (res.signature) {
      onUpdateOwnerProfile({
        voiceprint: res.signature,
        voiceLockStrict: true,
      });
      setVoiceEnrollMsg(`Voiceprint saved (${res.signature.centroidHz} Hz profile).`);
    } else {
      setVoiceEnrollMsg(res.error ?? 'Microphone unavailable. PIN protection stays active.');
    }
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) {
      setPinSavedMsg('Enter a 4-digit numeric PIN.');
      return;
    }
    onUpdateOwnerProfile({ pinHash: hashPin(newPin) });
    setNewPin('');
    setPinSavedMsg('Private PIN updated.');
  };

  const handleExportConfig = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      ownerProfile: {
        assistantName: ownerProfile.assistantName,
        ownerName: ownerProfile.ownerName,
        callOwnerAs: ownerProfile.callOwnerAs,
        languageMode: ownerProfile.languageMode,
        customInstructions: ownerProfile.customInstructions ?? '',
      },
      voiceSettings,
      emotionSettings: fullState.emotionSettings,
      routines: fullState.routines,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(ownerProfile.assistantName || 'jarvis').toLowerCase()}-custom-config.json`;
    link.click();
    URL.revokeObjectURL(url);
    setConfigMsg('Custom config JSON downloaded.');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AssistantState>;
      onImportConfig(parsed);
      setConfigMsg('Custom settings imported and applied.');
    } catch {
      setConfigMsg('Could not read JSON config file.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Assistant voice and identity settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sky-500/25 bg-[#081020] p-5 text-slate-100 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between border-b border-sky-500/15 pb-3">
          <h2 className="font-display text-lg font-semibold text-white">
            Customize, Voice & Laptop Lock
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {/* Activate / Deactivate & Auto-Deactivate Power Switch */}
          <div
            data-testid="menu-power-control"
            className="space-y-3 rounded-2xl border border-sky-500/20 bg-slate-900/90 px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  {ownerProfile.assistantName || 'JARVIS'} Status
                </p>
                <p className="text-xs text-slate-400">
                  {powerEnabled
                    ? 'Enabled — Listening & ready to respond'
                    : 'Off — Turned off while not in use'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl bg-[#050A14] p-1">
                <button
                  type="button"
                  data-testid="menu-activate-btn"
                  onClick={() => onTogglePower(true)}
                  className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    powerEnabled
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Enable
                </button>
                <button
                  type="button"
                  data-testid="menu-deactivate-btn"
                  onClick={() => onTogglePower(false)}
                  className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    !powerEnabled
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Off
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2.5">
              <div>
                <p className="text-xs font-medium text-slate-200">Auto-Deactivate when idle</p>
                <p className="text-[11px] text-slate-400">
                  Turns off mic & power automatically when not in use
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(voiceSettings.autoDeactivateEnabled ?? true) && (
                  <div className="flex items-center gap-1 rounded-lg bg-[#050A14] p-0.5">
                    {([1, 2, 5, 10] as const).map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        data-testid={`auto-deactivate-${mins}m`}
                        onClick={() => onUpdateVoiceSettings({ autoDeactivateMinutes: mins })}
                        className={`min-h-[28px] rounded-md px-2 text-[11px] font-medium ${
                          (voiceSettings.autoDeactivateMinutes ?? 2) === mins
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  data-testid="menu-auto-deactivate-toggle"
                  onClick={() =>
                    onUpdateVoiceSettings({
                      autoDeactivateEnabled: !(voiceSettings.autoDeactivateEnabled ?? true),
                    })
                  }
                  className={`min-h-[32px] rounded-lg px-3 py-1 text-xs font-semibold ${
                    (voiceSettings.autoDeactivateEnabled ?? true)
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {(voiceSettings.autoDeactivateEnabled ?? true) ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          </div>

          {/* Identity & Language */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="qs-ai-name" className="block text-xs text-slate-400">
                AI Wake Name
              </label>
              <input
                id="qs-ai-name"
                type="text"
                value={ownerProfile.assistantName}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateOwnerProfile({ assistantName: val });
                  onUpdateVoiceSettings({ wakeWord: val.trim().toLowerCase() || 'jarvis' });
                }}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-[#050A14] px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="qs-owner-name" className="block text-xs text-slate-400">
                Your Name
              </label>
              <input
                id="qs-owner-name"
                type="text"
                value={ownerProfile.ownerName}
                onChange={(e) => onUpdateOwnerProfile({ ownerName: e.target.value })}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-[#050A14] px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="qs-call-as" className="block text-xs text-slate-400">
                Call You As
              </label>
              <input
                id="qs-call-as"
                type="text"
                value={ownerProfile.callOwnerAs}
                onChange={(e) => onUpdateOwnerProfile({ callOwnerAs: e.target.value })}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-[#050A14] px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Custom Personality / Instructions */}
          <div>
            <label htmlFor="qs-custom-instructions" className="block text-xs text-slate-400">
              Custom Personality & Instructions (Customize how your AI talks & helps)
            </label>
            <textarea
              id="qs-custom-instructions"
              rows={2}
              value={ownerProfile.customInstructions ?? ''}
              onChange={(e) => onUpdateOwnerProfile({ customInstructions: e.target.value })}
              placeholder="e.g. Talk like a friendly coding mentor, explain concepts in simple Hindi, help me stay focused..."
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#050A14] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>

          {/* Language Selector */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-200">Language</span>
            <div className="flex items-center gap-1 rounded-xl bg-slate-900 p-1">
              {(['hinglish', 'hindi', 'english'] as const).map((lang: LanguageMode) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => {
                    onUpdateOwnerProfile({ languageMode: lang });
                    onUpdateVoiceSettings({
                      speechLang: lang === 'hindi' ? 'hi-IN' : lang === 'hinglish' ? 'en-IN' : 'en-US',
                    });
                  }}
                  className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium capitalize ${
                    ownerProfile.languageMode === lang
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Laptop Internal Microphone (No Bluetooth Needed) */}
          <div className="space-y-2 border-t border-sky-500/15 pt-4">
            <div className="flex items-center justify-between">
              <label htmlFor="qs-mic-mode" className="text-sm font-medium text-white">
                Laptop Microphone Input (No Bluetooth)
              </label>
              <button
                type="button"
                onClick={refreshMics}
                aria-label="Refresh detected microphones"
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                <span>Detect</span>
              </button>
            </div>
            <select
              id="qs-mic-mode"
              value={voiceSettings.micMode || 'builtin'}
              onChange={(e) => onUpdateVoiceSettings({ micMode: e.target.value })}
              className="min-h-[42px] w-full rounded-xl border border-slate-700 bg-[#050A14] px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
            >
              <option value="builtin">
                Built-in Laptop Mic (Recommended — No Bluetooth Needed)
              </option>
              <option value="auto">System Default Microphone</option>
              {micDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                  {d.isBluetooth ? ' (Bluetooth)' : d.isBuiltin ? ' (Built-in)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              Automatically uses your laptop&apos;s internal mic &amp; speakers so you do not need
              to connect Bluetooth.
            </p>
          </div>

          {/* Soft Human Voice Tuning */}
          <div className="space-y-3 border-t border-sky-500/15 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Soft Human Voice</span>
              <button
                type="button"
                onClick={onTestVoice}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
              >
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Test Voice</span>
              </button>
            </div>

            {liveApiReady && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/80 px-3.5 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-white">Real-Time Natural Human Voice</p>
                    <p className="text-[11px] text-slate-400">
                      Natural neural human voice &amp; instant streaming replies
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={voiceSettings.liveVoiceMode}
                    onClick={() =>
                      onUpdateVoiceSettings({ liveVoiceMode: !voiceSettings.liveVoiceMode })
                    }
                    className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold ${
                      voiceSettings.liveVoiceMode
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {voiceSettings.liveVoiceMode ? 'On' : 'Local Only'}
                  </button>
                </div>

                {voiceSettings.liveVoiceMode && (
                  <div>
                    <label htmlFor="qs-human-voice" className="block text-xs text-slate-400">
                      Human Voice Persona
                    </label>
                    <select
                      id="qs-human-voice"
                      value={voiceSettings.humanVoiceName || 'Zephyr'}
                      onChange={(e) =>
                        onUpdateVoiceSettings({
                          humanVoiceName: e.target.value as VoiceSettings['humanVoiceName'],
                        })
                      }
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-[#050A14] px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
                    >
                      <option value="Zephyr">Zephyr — Warm &amp; Natural</option>
                      <option value="Kore">Kore — Soft &amp; Gentle</option>
                      <option value="Puck">Puck — Friendly &amp; Upbeat</option>
                      <option value="Charon">Charon — Calm &amp; Deep</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <div>
              <label htmlFor="qs-voice-select" className="block text-xs text-slate-400">
                Fallback On-Device Voice
              </label>
              <select
                id="qs-voice-select"
                value={voiceSettings.voiceURI}
                onChange={(e) => onUpdateVoiceSettings({ voiceURI: e.target.value })}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-[#050A14] px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
              >
                <option value="auto">Automatic Softest Local Voice</option>
                {availableVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-xs text-slate-400">
                  <label htmlFor="qs-rate">Speaking Pace</label>
                  <span className="font-mono-tabular">{voiceSettings.rate.toFixed(2)}x</span>
                </div>
                <input
                  id="qs-rate"
                  type="range"
                  min={0.8}
                  max={1.15}
                  step={0.02}
                  value={voiceSettings.rate}
                  onChange={(e) => onUpdateVoiceSettings({ rate: Number(e.target.value) })}
                  className="mt-1.5 w-full accent-sky-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-400">
                  <label htmlFor="qs-pitch">Softness / Pitch</label>
                  <span className="font-mono-tabular">{voiceSettings.pitch.toFixed(2)}</span>
                </div>
                <input
                  id="qs-pitch"
                  type="range"
                  min={0.85}
                  max={1.12}
                  step={0.02}
                  value={voiceSettings.pitch}
                  onChange={(e) => onUpdateVoiceSettings({ pitch: Number(e.target.value) })}
                  className="mt-1.5 w-full accent-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Voiceprint & PIN */}
          <div className="space-y-3 border-t border-sky-500/15 pt-4">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/80 px-3.5 py-2.5">
              <div>
                <p className="text-xs font-medium text-white">Personal Voiceprint</p>
                <p className="text-[11px] text-slate-400">
                  {ownerProfile.voiceprint
                    ? `Enrolled (${ownerProfile.voiceprint.centroidHz} Hz)`
                    : 'Enroll your voice so only you can unlock'}
                </p>
              </div>
              <button
                type="button"
                disabled={enrollingVoice}
                onClick={() => void handleEnrollVoice()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                <Mic className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                <span>{enrollingVoice ? 'Listening...' : 'Enroll Voice'}</span>
              </button>
            </div>
            {voiceEnrollMsg && <p className="text-xs text-sky-300">{voiceEnrollMsg}</p>}

            <form onSubmit={handleSavePin} className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="qs-pin" className="block text-xs text-slate-400">
                  Update 4-Digit Owner PIN
                </label>
                <input
                  id="qs-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="New 4-digit PIN"
                  className="font-mono-tabular mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-[#050A14] px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Save PIN</span>
              </button>
            </form>
            {pinSavedMsg && <p className="text-xs text-sky-300">{pinSavedMsg}</p>}
          </div>

          {/* Laptop Source Download & Custom JSON Backup */}
          <div className="space-y-2.5 border-t border-sky-500/15 pt-4">
            <p className="text-xs font-medium text-white">Download &amp; Customize on Laptop</p>
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/download-source"
                download="jarvis-personal-assistant.zip"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-sky-600/20 border border-sky-500/40 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-600/30"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Download Code (.zip)</span>
              </a>
              <button
                type="button"
                onClick={handleExportConfig}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Export Config (.json)</span>
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Import Config</span>
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => void handleImportFile(e)}
                className="hidden"
              />
            </div>
            {configMsg && <p className="text-xs text-sky-300">{configMsg}</p>}
          </div>

          <div className="flex items-center justify-between border-t border-sky-500/15 pt-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                onReopenOnboarding();
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Run Setup Wizard</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
