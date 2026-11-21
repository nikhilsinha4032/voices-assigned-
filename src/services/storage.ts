import { createInitialState } from '../data/seed';
import { isValidAssistantState } from '../engine/routines';
import type { AssistantState } from '../types/assistant';

const STORAGE_KEY = 'jarvis_local_state_v2';

export function loadLocalState(): AssistantState {
  const fallback = createInitialState();
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (isValidAssistantState(parsed)) {
      return {
        ...fallback,
        ...parsed,
        powerEnabled: parsed.powerEnabled ?? true,
        ownerProfile: {
          ...fallback.ownerProfile,
          ...(parsed.ownerProfile ?? {}),
        },
        voiceSettings: {
          ...fallback.voiceSettings,
          ...(parsed.voiceSettings ?? {}),
          voiceEnabled: true,
          autoSpeakReplies: true,
          autoDeactivateEnabled: parsed.voiceSettings?.autoDeactivateEnabled ?? true,
          autoDeactivateMinutes: parsed.voiceSettings?.autoDeactivateMinutes ?? 2,
        },
      };
    }
  } catch {
    // Fallback cleanly to initial seed state
  }
  return fallback;
}

export function saveLocalState(state: AssistantState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors gracefully
  }
}

export function clearLocalState(): AssistantState {
  const fresh = createInitialState();
  saveLocalState(fresh);
  return fresh;
}
