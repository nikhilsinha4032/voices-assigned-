import React from 'react';
import { ExternalLink, Globe, HardDrive, MessageCircle, Music2, Play, VolumeX, X } from 'lucide-react';
import type { AppLaunchIntent } from '../engine/appLauncher';
import type {
  AssistantMood,
  OwnerProfile,
} from '../types/assistant';
import { JarvisHologram3D } from './JarvisHologram3D';

interface VoiceCoreProps {
  ownerProfile: OwnerProfile;
  currentMood: AssistantMood;
  isPoweredOn: boolean;
  isActivated: boolean;
  isWakeListening: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  audioLevel: number;
  interimTranscript: string;
  voiceNotice: string | null;
  pendingAppAction?: AppLaunchIntent | null;
  appSearchSummary?: string | null;
  onDismissAppAction?: () => void;
  onOpenDrive?: (query?: string) => void;
  onTapHologram: () => void;
  onStopSpeaking: () => void;
}

export const VoiceCore: React.FC<VoiceCoreProps> = ({
  ownerProfile,
  currentMood,
  isPoweredOn,
  isActivated,
  isWakeListening,
  isListening,
  isSpeaking,
  isThinking,
  audioLevel,
  interimTranscript,
  voiceNotice,
  pendingAppAction,
  appSearchSummary,
  onDismissAppAction,
  onOpenDrive,
  onTapHologram,
  onStopSpeaking,
}) => {
  const assistantName = ownerProfile.assistantName || 'JARVIS';
  const callOwnerAs = ownerProfile.callOwnerAs || ownerProfile.ownerName || 'Sir';

  const statusLine = !isPoweredOn
    ? `${assistantName} is Off · Tap Power icon or open Menu to Enable`
    : interimTranscript
    ? `"${interimTranscript}..."`
    : isThinking
    ? `${assistantName} is answering...`
    : isSpeaking
    ? `${assistantName} is speaking...`
    : isWakeListening
    ? `Listening continuously for ${callOwnerAs}...`
    : isActivated
    ? `Active for ${callOwnerAs} · Speak freely (No need to repeat "${assistantName}")`
    : isListening
    ? `Standby · Mic listening — Say "${assistantName}" once to activate`
    : `Standby · Tap hologram or say "${assistantName}" to talk`;

  const showWakeIndicator = isPoweredOn && isWakeListening && !isSpeaking && !isThinking;

  return (
    <section
      aria-label={`${assistantName} 3D Hologram Assistant`}
      className="flex flex-col items-center rounded-3xl border border-sky-500/20 bg-[#050A14] px-4 py-6 text-center sm:px-8 sm:py-8"
    >
      {/* Hero 3D Holographic AI Robot Core */}
      <button
        type="button"
        onClick={onTapHologram}
        aria-label={isPoweredOn ? `Talk to ${assistantName}` : `${assistantName} is deactivated`}
        className={`w-full max-w-[440px] rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
          isPoweredOn ? 'cursor-pointer' : 'cursor-default opacity-60'
        }`}
      >
        <JarvisHologram3D
          isActivated={isPoweredOn && isActivated}
          isListening={isPoweredOn && isWakeListening && !isSpeaking}
          isSpeaking={isPoweredOn && isSpeaking}
          mood={currentMood}
          audioLevel={isPoweredOn ? audioLevel : 0}
          className="h-[310px] w-full rounded-2xl sm:h-[360px]"
          label={`${assistantName} 3D Hologram Core`}
        />
      </button>

      {/* Visual Wake-Triggered Continuous Listening Indicator + Status Line */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
        {showWakeIndicator && (
          <div
            data-testid="wake-listening-indicator"
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-2 rounded-full border border-teal-400/45 bg-teal-500/15 px-3 py-1 text-xs font-semibold text-teal-200 shadow-sm shadow-teal-500/20"
          >
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-300 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-400" />
            </span>
            <span className="flex items-end gap-0.5 h-3" aria-hidden="true">
              <span className="w-0.5 h-1.5 animate-pulse rounded-full bg-teal-300" />
              <span className="w-0.5 h-3 animate-pulse rounded-full bg-teal-200" />
              <span className="w-0.5 h-2 animate-pulse rounded-full bg-teal-300" />
            </span>
            <span>Listening</span>
          </div>
        )}

        <p
          data-testid="jarvis-status-line"
          className="max-w-xl text-sm font-medium text-sky-200"
        >
          {statusLine}
        </p>

        {isPoweredOn && isSpeaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            aria-label="Mute voice"
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Mute</span>
          </button>
        )}
      </div>

      {voiceNotice && isPoweredOn && (
        <p
          role="status"
          className="mt-3 max-w-lg rounded-xl border border-amber-700/40 bg-amber-950/40 px-3.5 py-2 text-xs text-amber-200"
        >
          {voiceNotice}
        </p>
      )}

      {isPoweredOn && pendingAppAction && (
        <div
          data-testid="app-action-card"
          className="mt-4 w-full max-w-lg rounded-2xl border border-sky-500/25 bg-[#081020] p-4 text-left shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
                {pendingAppAction.target === 'spotify' ? (
                  <Music2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                ) : pendingAppAction.target === 'youtube' ? (
                  <Play className="h-4 w-4 text-rose-400" aria-hidden="true" />
                ) : pendingAppAction.target === 'whatsapp' ? (
                  <MessageCircle className="h-4 w-4 text-green-400" aria-hidden="true" />
                ) : pendingAppAction.target === 'drive' ? (
                  <HardDrive className="h-4 w-4 text-sky-300" aria-hidden="true" />
                ) : (
                  <Globe className="h-4 w-4 text-sky-400" aria-hidden="true" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                  {pendingAppAction.label}
                </p>
                <p className="text-sm font-medium text-white">{pendingAppAction.query}</p>
              </div>
            </div>
            {onDismissAppAction && (
              <button
                type="button"
                onClick={onDismissAppAction}
                aria-label="Dismiss app action"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {appSearchSummary && (
            <p
              data-testid="app-action-summary"
              className="mt-2.5 rounded-xl bg-[#050A14] px-3 py-2 text-xs leading-relaxed text-slate-200"
            >
              {appSearchSummary}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pendingAppAction.target === 'drive' && onOpenDrive && (
              <button
                type="button"
                data-testid="app-action-drive-btn"
                onClick={() =>
                  onOpenDrive(
                    pendingAppAction.query === 'Open Google Drive' ? '' : pendingAppAction.query
                  )
                }
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
              >
                <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Open Drive Workspace</span>
              </button>
            )}
            <a
              data-testid="app-action-web-link"
              href={pendingAppAction.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold ${
                pendingAppAction.target === 'drive'
                  ? 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                  : 'bg-sky-600 text-white hover:bg-sky-500'
              }`}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {pendingAppAction.target === 'chrome'
                  ? 'Open in Chrome'
                  : `Open ${pendingAppAction.label}`}
              </span>
            </a>

            {pendingAppAction.appUri && (
              <a
                data-testid="app-action-native-link"
                href={pendingAppAction.appUri}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <span>Open App</span>
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
