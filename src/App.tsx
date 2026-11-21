import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { HardDrive, Lock, Power, SlidersHorizontal } from 'lucide-react';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OwnerLockGate } from './components/OwnerLockGate';
import { PersonalOnboarding } from './components/PersonalOnboarding';
import { PWAInstallButton } from './components/PWAInstallButton';
import { QuickSettingsModal } from './components/QuickSettingsModal';
import { VoiceCore } from './components/VoiceCore';
import type { AppLaunchIntent } from './engine/appLauncher';
import { filterRecentConversationTurns } from './engine/conversationFilter';
import { processNaturalCommand } from './engine/nlu';
import {
  parseVoiceActivationAlternatives,
  parseVoiceActivationCommand,
} from './engine/voiceActivation';
import { launchAppSafely } from './services/appLaunchClient';
import { streamChatWithRetry } from './services/brainClient';
import {
  googleDriveLogout,
  googleDriveSignIn,
  initDriveAuth,
} from './services/googleDrive';
import { loadLocalState, saveLocalState } from './services/storage';
import {
  getAvailableVoices,
  type LocalVoiceOption,
  playTactileChime,
  primeAudioPlayback,
  setNeuralTtsCooldown,
  setVoiceCapturePaused,
  speakHumanized,
  startVoiceCapture,
  stopSpeaking,
} from './services/voice';
import type {
  AssistantMood,
  AssistantState,
  OwnerProfile,
  UserEmotion,
  VoiceSettings,
} from './types/assistant';

export default function App() {
  const [state, setState] = useState<AssistantState>(() => {
    const loaded = loadLocalState();
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autostart') === '1'
    ) {
      return {
        ...loaded,
        ownerProfile: { ...loaded.ownerProfile, onboardingCompleted: true, isLocked: false },
      };
    }
    return loaded;
  });

  const isPoweredOn = state.powerEnabled !== false;
  const isActivated = Boolean(state.isActivated);
  const [isListening, setIsListening] = useState(false);
  const [isWakeListening, setIsWakeListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [liveApiReady, setLiveApiReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<LocalVoiceOption[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [driveInitialQuery, setDriveInitialQuery] = useState('');
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [pendingAppAction, setPendingAppAction] = useState<AppLaunchIntent | null>(null);
  const [appSearchSummary, setAppSearchSummary] = useState<string | null>(null);

  const stopCaptureRef = useRef<(() => void) | null>(null);
  const brainAbortRef = useRef<AbortController | null>(null);
  const brainReqIdRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const isThinkingRef = useRef(false);
  const isActivatedRef = useRef(isActivated);
  const isPoweredOnRef = useRef(isPoweredOn);
  const lastWakeAckAtRef = useRef(0);
  const lastActivityAtRef = useRef(Date.now());
  const manualMicStartRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  isSpeakingRef.current = isSpeaking;
  isThinkingRef.current = isThinking;
  isActivatedRef.current = isActivated;
  isPoweredOnRef.current = isPoweredOn;

  const setActivatedState = useCallback((next: boolean) => {
    isActivatedRef.current = next;
    setState((prev) => (Boolean(prev.isActivated) === next ? prev : { ...prev, isActivated: next }));
  }, []);

  useEffect(() => {
    saveLocalState(state);
    document.documentElement.classList.add('dark');
  }, [state]);

  useEffect(() => {
    const syncVoices = () => setAvailableVoices(getAvailableVoices());
    syncVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = syncVoices;
    }

    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { liveReady?: boolean; ttsReady?: boolean } | null) => {
        if (data?.liveReady) setLiveApiReady(true);
        if (data && data.ttsReady === false) {
          setNeuralTtsCooldown();
        }
      })
      .catch(() => {
        // Offline or local-only mode
      });

    const unsubDriveAuth = initDriveAuth(
      (user, token) => {
        setDriveUser(user);
        setDriveAccessToken(token);
      },
      () => {
        setDriveAccessToken(null);
      }
    );

    return () => {
      unsubDriveAuth();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const speakSoftly = useCallback(
    (text: string, moodOverride?: AssistantMood, userEmotionOverride: UserEmotion = 'neutral') => {
      primeAudioPlayback();
      const current = stateRef.current;
      speakHumanized(text, {
        mood: moodOverride ?? current.currentMood,
        userEmotion: userEmotionOverride,
        emotionSettings: current.emotionSettings,
        voiceSettings: current.voiceSettings,
        onStart: () => {
          setVoiceCapturePaused(true);
          setIsSpeaking(true);
          setVoiceNotice((prev) =>
            prev?.includes('enable speaker audio') ? null : prev
          );
        },
        onAudioLevel: (lvl) => setAudioLevel(lvl),
        onBlocked: () => {
          setIsSpeaking(false);
          setAudioLevel(0);
          setVoiceCapturePaused(false);
          setVoiceNotice('Tap or click anywhere once to enable speaker audio.');
        },
        onEnd: () => {
          lastActivityAtRef.current = Date.now();
          setIsSpeaking(false);
          setAudioLevel(0);
          setVoiceCapturePaused(false);
        },
      });
    },
    []
  );

  const queryConversationalBrain = useCallback(
    async (
      prompt: string,
      currentState: AssistantState,
      signal: AbortSignal,
      onDelta?: (partialText: string) => void,
      useSearchGrounding = false
    ): Promise<string | null> => {
      const hasDevanagari = /[\u0900-\u097F]/.test(prompt);
      const hasHinglish =
        /\b(kya|kaun|kab|kahan|kaise|kaisa|kaisi|kaunsa|kaunsi|kyon|kyun|kyunki|batao|bataiye|bata|sunao|sikhao|pucho|bolo|samjhao|matlab|mera|meri|mere|mujhe|karo|hai|hoon|hoga|aaj|kal|kitna|kitne|kisne|tarika|tareeka|fayde|nuksan)\b/i.test(
          prompt
        );
      const effectiveLanguageMode = hasDevanagari
        ? 'hindi'
        : hasHinglish && currentState.ownerProfile.languageMode === 'english'
        ? 'hinglish'
        : currentState.ownerProfile.languageMode;

      const cleanRecentTurns = filterRecentConversationTurns(currentState.history, 4);

      return streamChatWithRetry({
        payload: {
          prompt,
          assistantName: currentState.ownerProfile.assistantName,
          callOwnerAs: currentState.ownerProfile.callOwnerAs || currentState.ownerProfile.ownerName,
          languageMode: effectiveLanguageMode,
          mood: currentState.currentMood,
          customInstructions: currentState.ownerProfile.customInstructions || '',
          useSearchGrounding,
          recentTurns: cleanRecentTurns,
        },
        signal,
        onDelta,
        maxStreamAttempts: 2,
        keepAliveTimeoutMs: 5500,
        retryDelayMs: 220,
        fallbackTimeoutMs: 8000,
      });
    },
    []
  );

  const handleCommand = useCallback(
    async (rawText: string) => {
      if (!isPoweredOnRef.current) return;
      const trimmedInput = rawText.trim();
      if (!trimmedInput) return;
      // Ignore single-character noise fragments while an answer is already being generated
      if (isThinkingRef.current && trimmedInput.length <= 1) return;
      lastActivityAtRef.current = Date.now();
      primeAudioPlayback();
      const current = stateRef.current;
      const activation = parseVoiceActivationCommand(
        trimmedInput,
        current.ownerProfile.assistantName,
        true
      );

      if (activation.type === 'deactivate') {
        brainReqIdRef.current += 1;
        brainAbortRef.current?.abort();
        brainAbortRef.current = null;
        setIsThinking(false);
        setIsWakeListening(false);
        setActivatedState(false);
        playTactileChime('sleep', current.voiceSettings.chimeEnabled);
        const callName = current.ownerProfile.callOwnerAs || current.ownerProfile.ownerName || 'Sir';
        const byeText =
          current.ownerProfile.languageMode === 'english'
            ? `Going on standby, ${callName}. Just say my name whenever you need me.`
            : `Theek hai ${callName}, main standby par ja raha hoon. Jab zaroorat ho bas mera naam bol dena.`;
        setState((prev) => ({
          ...prev,
          isActivated: false,
          history: [
            ...prev.history,
            {
              id: `user-${Date.now()}`,
              role: 'user' as const,
              text: rawText.trim(),
              timestamp: new Date().toISOString(),
            },
            {
              id: `asst-${Date.now() + 1}`,
              role: 'assistant' as const,
              text: byeText,
              timestamp: new Date(Date.now() + 1).toISOString(),
              mood: prev.currentMood,
            },
          ].slice(-40),
        }));
        if (current.voiceSettings.autoSpeakReplies) {
          speakSoftly(byeText);
        }
        return;
      }

      const cleanCommand =
        activation.type === 'activate' && activation.command
          ? activation.command
          : rawText.trim();

      if (activation.type === 'activate' && !activation.command) {
        setActivatedState(true);
        lastWakeAckAtRef.current = Date.now();
        playTactileChime('listen', current.voiceSettings.chimeEnabled);
        return;
      }

      setActivatedState(true);
      const localResult = processNaturalCommand(current, cleanCommand, new Date());

      if (localResult.appAction) {
        setPendingAppAction(localResult.appAction);
        setAppSearchSummary(null);
        if (localResult.appAction.target === 'drive') {
          setDriveInitialQuery(
            localResult.appAction.query === 'Open Google Drive' ? '' : localResult.appAction.query
          );
          setDriveModalOpen(true);
        } else {
          void launchAppSafely(localResult.appAction);
        }
      }

      if (!localResult.shouldQueryBrain) {
        setState(localResult.nextState);
        playTactileChime('confirm', localResult.nextState.voiceSettings.chimeEnabled);
        if (localResult.nextState.voiceSettings.autoSpeakReplies) {
          speakSoftly(localResult.reply, localResult.nextMood, localResult.detectedEmotion);
        }
        return;
      }

      // Friendly general conversation / Chrome search summary with real-time SSE streaming
      brainAbortRef.current?.abort();
      const controller = new AbortController();
      brainAbortRef.current = controller;
      const reqId = ++brainReqIdRef.current;
      const streamTurnId = `asst-stream-${Date.now()}`;
      const isSearchSummary = Boolean(localResult.appAction?.summaryPrompt);
      const brainPrompt = localResult.appAction?.summaryPrompt ?? cleanCommand;

      // Show user turn immediately and stream assistant text as tokens arrive
      const baseHistory = localResult.nextState.history.slice(0, -1);
      const initialStreamState: AssistantState = {
        ...localResult.nextState,
        history: [
          ...baseHistory,
          {
            id: streamTurnId,
            role: 'assistant' as const,
            text: '...',
            timestamp: new Date().toISOString(),
            mood: localResult.nextMood,
          },
        ].slice(-40),
      };
      setState(initialStreamState);
      setIsThinking(true);

      const smartReply = await queryConversationalBrain(
        brainPrompt,
        current,
        controller.signal,
        (partialText) => {
          if (reqId !== brainReqIdRef.current) return;
          setIsThinking(false);
          if (isSearchSummary) {
            setAppSearchSummary(partialText);
          }
          setState((prev) => ({
            ...prev,
            history: prev.history.map((turn) =>
              turn.id === streamTurnId ? { ...turn, text: partialText } : turn
            ),
          }));
        },
        isSearchSummary
      );

      if (reqId !== brainReqIdRef.current) {
        return;
      }
      setIsThinking(false);

      const finalReply = smartReply || localResult.reply;
      if (isSearchSummary && smartReply) {
        setAppSearchSummary(smartReply);
      }
      setState((prev) => ({
        ...prev,
        history: prev.history.map((turn) =>
          turn.id === streamTurnId ? { ...turn, text: finalReply } : turn
        ),
      }));

      playTactileChime('confirm', localResult.nextState.voiceSettings.chimeEnabled);
      if (localResult.nextState.voiceSettings.autoSpeakReplies) {
        speakSoftly(finalReply, localResult.nextMood, localResult.detectedEmotion);
      }
    },
    [queryConversationalBrain, setActivatedState, speakSoftly]
  );

  const stopVoiceListener = useCallback(() => {
    stopCaptureRef.current?.();
    stopCaptureRef.current = null;
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startVoiceListener = useCallback(
    (isAutoStart = false) => {
      stopVoiceListener();
      manualMicStartRef.current = !isAutoStart;
      setVoiceNotice(null);
      setIsListening(true);

      stopCaptureRef.current = startVoiceCapture({
        continuous: true,
        lang: stateRef.current.voiceSettings.speechLang,
        onInterim: (text, alternatives) => {
          if (isSpeakingRef.current) return;
          setInterimTranscript(text);

          // Trigger visual 'listening' indicator immediately on wake-word recognition
          // without interrupting or restarting the continuous microphone stream.
          const current = stateRef.current;
          const { action } = parseVoiceActivationAlternatives(
            alternatives?.length ? alternatives : [text],
            current.ownerProfile.assistantName,
            isActivatedRef.current
          );

          if (!isActivatedRef.current && action.type === 'activate') {
            lastActivityAtRef.current = Date.now();
            setActivatedState(true);
            setIsWakeListening(true);
            if (Date.now() - lastWakeAckAtRef.current > 1800) {
              lastWakeAckAtRef.current = Date.now();
              playTactileChime('listen', current.voiceSettings.chimeEnabled);
            }
          } else if (isActivatedRef.current && action.type !== 'deactivate') {
            setIsWakeListening(true);
          }
        },
        onFinal: (finalText, alternatives) => {
          setInterimTranscript('');
          // Suppress echo while JARVIS is speaking aloud
          if (isSpeakingRef.current) return;

          const current = stateRef.current;
          const { action, matchedTranscript } = parseVoiceActivationAlternatives(
            alternatives?.length ? alternatives : [finalText],
            current.ownerProfile.assistantName,
            isActivatedRef.current
          );

          if (action.type === 'ignore') return;

          if (action.type === 'deactivate') {
            setIsWakeListening(false);
            void handleCommand(matchedTranscript);
            return;
          }

          if (action.type === 'activate') {
            lastActivityAtRef.current = Date.now();
            setActivatedState(true);
            setIsWakeListening(true);
            if (action.command) {
              void handleCommand(action.command);
            } else if (Date.now() - lastWakeAckAtRef.current > 1800) {
              lastWakeAckAtRef.current = Date.now();
              playTactileChime('listen', current.voiceSettings.chimeEnabled);
            }
            return;
          }

          if (action.type === 'command') {
            setIsWakeListening(true);
            void handleCommand(action.command);
          }
        },
        onError: (msg) => {
          if (manualMicStartRef.current || !msg.toLowerCase().includes('denied')) {
            setVoiceNotice(msg);
          }
          stopCaptureRef.current = null;
          setIsListening(false);
        },
        onEnd: () => {
          stopCaptureRef.current = null;
          setIsListening(false);
          setInterimTranscript('');
        },
      });
    },
    [handleCommand, setActivatedState, stopVoiceListener]
  );

  // Automatically keep the wake-word microphone listener armed whenever powered on and unlocked
  const canAutoListen =
    isPoweredOn &&
    state.ownerProfile.onboardingCompleted &&
    !state.ownerProfile.isLocked &&
    state.voiceSettings.wakeWordEnabled;

  useEffect(() => {
    if (!canAutoListen) {
      stopVoiceListener();
      return;
    }

    startVoiceListener(true);

    const resumeOnGesture = () => {
      if (
        isPoweredOnRef.current &&
        stateRef.current.ownerProfile.onboardingCompleted &&
        !stateRef.current.ownerProfile.isLocked &&
        stateRef.current.voiceSettings.wakeWordEnabled &&
        !stopCaptureRef.current
      ) {
        startVoiceListener(true);
      }
    };
    window.addEventListener('pointerdown', resumeOnGesture, { passive: true, once: true });
    window.addEventListener('keydown', resumeOnGesture, { passive: true, once: true });

    return () => {
      window.removeEventListener('pointerdown', resumeOnGesture);
      window.removeEventListener('keydown', resumeOnGesture);
      stopVoiceListener();
    };
  }, [canAutoListen, state.voiceSettings.speechLang, startVoiceListener, stopVoiceListener]);

  const handleTogglePower = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        brainReqIdRef.current += 1;
        brainAbortRef.current?.abort();
        brainAbortRef.current = null;
        setIsThinking(false);
        setIsWakeListening(false);
        setPendingAppAction(null);
        setAppSearchSummary(null);
        stopVoiceListener();
        stopSpeaking();
        setIsSpeaking(false);
        setAudioLevel(0);
        setVoiceCapturePaused(false);
        setVoiceNotice(null);
        isPoweredOnRef.current = false;
        isActivatedRef.current = false;
        playTactileChime('sleep', stateRef.current.voiceSettings.chimeEnabled);
        setState((prev) => ({
          ...prev,
          powerEnabled: false,
          isActivated: false,
        }));
        return;
      }

      lastActivityAtRef.current = Date.now();
      primeAudioPlayback();
      isPoweredOnRef.current = true;
      isActivatedRef.current = true;
      setIsWakeListening(true);
      const current = stateRef.current;
      const callName = current.ownerProfile.callOwnerAs || current.ownerProfile.ownerName || 'Sir';
      const activeMsg =
        current.ownerProfile.languageMode === 'english'
          ? `Enabled, ${callName}. Ready.`
          : `Haan ${callName}, main active hoon.`;

      playTactileChime('listen', current.voiceSettings.chimeEnabled);
      setState((prev) => ({
        ...prev,
        powerEnabled: true,
        isActivated: true,
      }));

      if (current.voiceSettings.autoSpeakReplies) {
        speakSoftly(activeMsg);
      }
    },
    [speakSoftly, stopVoiceListener]
  );

  // Auto-Deactivate when idle so mic & assistant turn off automatically when unused
  const autoDeactivateEnabled = state.voiceSettings.autoDeactivateEnabled ?? true;
  const autoDeactivateMinutes = state.voiceSettings.autoDeactivateMinutes ?? 2;

  useEffect(() => {
    if (
      !isPoweredOn ||
      !autoDeactivateEnabled ||
      !state.ownerProfile.onboardingCompleted ||
      state.ownerProfile.isLocked
    ) {
      return;
    }

    const idleThresholdMs = Math.max(1, autoDeactivateMinutes) * 60_000;
    const timer = window.setInterval(() => {
      if (
        isPoweredOnRef.current &&
        !isThinkingRef.current &&
        !isSpeakingRef.current &&
        Date.now() - lastActivityAtRef.current >= idleThresholdMs
      ) {
        handleTogglePower(false);
      }
    }, 10_000);

    return () => window.clearInterval(timer);
  }, [
    isPoweredOn,
    autoDeactivateEnabled,
    autoDeactivateMinutes,
    state.ownerProfile.onboardingCompleted,
    state.ownerProfile.isLocked,
    handleTogglePower,
  ]);

  const handleUpdateOwnerProfile = (patch: Partial<OwnerProfile>) => {
    setState((prev) => ({
      ...prev,
      ownerProfile: { ...prev.ownerProfile, ...patch },
    }));
  };

  const handleUpdateVoiceSettings = (patch: Partial<VoiceSettings>) => {
    setState((prev) => ({
      ...prev,
      voiceSettings: { ...prev.voiceSettings, ...patch },
    }));
  };

  const handleImportConfig = (imported: Partial<AssistantState>) => {
    setState((prev) => ({
      ...prev,
      ownerProfile: {
        ...prev.ownerProfile,
        ...(imported.ownerProfile ?? {}),
        pinHash: prev.ownerProfile.pinHash,
        isLocked: false,
      },
      voiceSettings: {
        ...prev.voiceSettings,
        ...(imported.voiceSettings ?? {}),
      },
      emotionSettings: {
        ...prev.emotionSettings,
        ...(imported.emotionSettings ?? {}),
      },
      routines: Array.isArray(imported.routines) ? imported.routines : prev.routines,
    }));
  };

  const handleTestVoice = () => {
    const callName = state.ownerProfile.callOwnerAs || state.ownerProfile.ownerName || 'Sir';
    const sample =
      state.ownerProfile.languageMode === 'english'
        ? `Hello ${callName}. My voice is calibrated softly just for you.`
        : `Namaste ${callName}. Main ${state.ownerProfile.assistantName} hoon, ab meri aawaz bilkul soft aur natural hai.`;
    speakSoftly(sample);
  };

  // 1. Personal Onboarding Wizard
  if (!state.ownerProfile.onboardingCompleted) {
    return (
      <PersonalOnboarding
        initialProfile={state.ownerProfile}
        onComplete={({ ownerProfile, initialFocus }) => {
          const speechLang =
            ownerProfile.languageMode === 'hindi'
              ? ('hi-IN' as const)
              : ownerProfile.languageMode === 'hinglish'
              ? ('en-IN' as const)
              : ('en-US' as const);
          const welcomeMsg =
            ownerProfile.languageMode === 'english'
              ? `Welcome, ${ownerProfile.callOwnerAs}. I am ${ownerProfile.assistantName}, focused on "${initialFocus}". Say my name whenever you need me.`
              : `Swagat hai ${ownerProfile.callOwnerAs}. Main ${ownerProfile.assistantName} hoon. Bas mera naam bolna aur main haazir ho jaunga.`;

          setState((prev) => ({
            ...prev,
            ownerProfile,
            emotionSettings: {
              ...prev.emotionSettings,
              userName: ownerProfile.callOwnerAs || ownerProfile.ownerName,
            },
            voiceSettings: {
              ...prev.voiceSettings,
              speechLang,
              wakeWord: ownerProfile.assistantName.toLowerCase(),
            },
            history: [
              {
                id: `welcome-${Date.now()}`,
                role: 'assistant' as const,
                text: welcomeMsg,
                timestamp: new Date().toISOString(),
                mood: prev.currentMood,
              },
            ],
          }));
        }}
      />
    );
  }

  // 2. Exclusive Owner Lock Gate
  if (state.ownerProfile.isLocked) {
    return (
      <OwnerLockGate
        ownerProfile={state.ownerProfile}
        onUnlock={() => {
          handleUpdateOwnerProfile({ isLocked: false });
          playTactileChime('confirm', state.voiceSettings.chimeEnabled);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#050A14] text-slate-100">
      {/* Clean Single Top Bar (3 zones, zero extra tabs) */}
      <header className="sticky top-0 z-30 border-b border-sky-500/15 bg-[#050A14]/95 px-4 sm:px-8">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4">
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            {state.ownerProfile.assistantName}
          </span>

          <span className="hidden text-xs font-medium text-slate-400 sm:inline">
            {!isPoweredOn ? 'Deactivated (Off)' : isActivated ? 'Voice Active' : 'Voice Standby'} ·{' '}
            {state.ownerProfile.ownerName}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="header-power-toggle"
              onClick={() => handleTogglePower(!isPoweredOn)}
              aria-label={isPoweredOn ? 'Turn off assistant' : 'Enable assistant'}
              title={isPoweredOn ? 'Turn off when not in use' : 'Enable assistant'}
              className={`flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl transition-colors ${
                isPoweredOn
                  ? 'text-sky-400 hover:bg-slate-800 hover:text-white'
                  : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 hover:text-amber-300'
              }`}
            >
              <Power className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => {
                brainReqIdRef.current += 1;
                brainAbortRef.current?.abort();
                brainAbortRef.current = null;
                setIsThinking(false);
                setIsWakeListening(false);
                stopVoiceListener();
                stopSpeaking();
                setActivatedState(false);
                handleUpdateOwnerProfile({ isLocked: true });
              }}
              aria-label="Lock assistant for owner privacy"
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-sky-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-testid="header-drive-button"
              onClick={() => {
                setDriveInitialQuery('');
                setDriveModalOpen(true);
              }}
              aria-label="Open Google Drive"
              title={driveAccessToken ? 'Google Drive Connected' : 'Connect Google Drive'}
              className="relative flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-sky-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <HardDrive className="h-4 w-4" aria-hidden="true" />
              {driveAccessToken && (
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-400"
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open voice and privacy settings"
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>

            <PWAInstallButton compact onOpenCustomize={() => setSettingsOpen(true)} />
          </div>
        </div>
      </header>

      {/* Single Clean Home Workspace */}
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <VoiceCore
          ownerProfile={state.ownerProfile}
          currentMood={state.currentMood}
          isPoweredOn={isPoweredOn}
          isActivated={isActivated}
          isWakeListening={isWakeListening}
          isListening={isListening}
          isSpeaking={isSpeaking}
          isThinking={isThinking}
          audioLevel={audioLevel}
          interimTranscript={interimTranscript}
          voiceNotice={voiceNotice}
          pendingAppAction={pendingAppAction}
          appSearchSummary={appSearchSummary}
          onDismissAppAction={() => {
            setPendingAppAction(null);
            setAppSearchSummary(null);
          }}
          onOpenDrive={(query = '') => {
            setDriveInitialQuery(query);
            setDriveModalOpen(true);
          }}
          onTapHologram={() => {
            if (!isPoweredOnRef.current) return;
            lastActivityAtRef.current = Date.now();
            primeAudioPlayback();
            if (!stopCaptureRef.current && stateRef.current.voiceSettings.wakeWordEnabled) {
              startVoiceListener(false);
            }
            if (!isActivatedRef.current) {
              void handleCommand(stateRef.current.ownerProfile.assistantName || 'JARVIS');
            }
          }}
          onStopSpeaking={() => {
            stopSpeaking();
            setIsSpeaking(false);
            setVoiceCapturePaused(false);
          }}
        />
      </main>

      <GoogleDriveModal
        open={driveModalOpen}
        onClose={() => setDriveModalOpen(false)}
        user={driveUser}
        accessToken={driveAccessToken}
        initialQuery={driveInitialQuery}
        onSignIn={async () => {
          const result = await googleDriveSignIn();
          setDriveUser(result.user);
          setDriveAccessToken(result.accessToken);
        }}
        onSignOut={async () => {
          await googleDriveLogout();
          setDriveUser(null);
          setDriveAccessToken(null);
        }}
        onAuthExpired={() => setDriveAccessToken(null)}
      />

      <QuickSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        powerEnabled={isPoweredOn}
        onTogglePower={handleTogglePower}
        ownerProfile={state.ownerProfile}
        voiceSettings={state.voiceSettings}
        fullState={state}
        availableVoices={availableVoices}
        liveApiReady={liveApiReady}
        onUpdateOwnerProfile={handleUpdateOwnerProfile}
        onUpdateVoiceSettings={handleUpdateVoiceSettings}
        onImportConfig={handleImportConfig}
        onTestVoice={handleTestVoice}
        onReopenOnboarding={() => {
          stopVoiceListener();
          stopSpeaking();
          handleUpdateOwnerProfile({ onboardingCompleted: false });
        }}
      />

      <OfflineIndicator />
    </div>
  );
}
