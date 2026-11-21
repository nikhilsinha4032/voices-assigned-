export type TaskCategory = 'Focus' | 'Health' | 'Home' | 'Personal';
export type TaskPriority = 'normal' | 'high';

export interface TaskItem {
  id: string;
  title: string;
  dueTime?: string; // HH:MM 24h
  category: TaskCategory;
  priority: TaskPriority;
  completed: boolean;
  createdAt: string;
  isReminder?: boolean;
}

export interface RoutineItem {
  id: string;
  title: string;
  time: string; // HH:MM 24h
  days: number[]; // 0 (Sun) - 6 (Sat)
  enabled: boolean;
  reminderMessage: string;
  sceneId?: string;
  lastTriggeredDate?: string; // YYYY-MM-DD
  snoozedUntil?: number; // epoch ms
}

export type DeviceType =
  | 'light'
  | 'thermostat'
  | 'lock'
  | 'blinds'
  | 'purifier'
  | 'coffee'
  | 'speaker';

export type RoomName = 'Living Room' | 'Bedroom' | 'Kitchen' | 'Entryway' | 'Office';

export interface SmartDevice {
  id: string;
  name: string;
  room: RoomName;
  type: DeviceType;
  isOn: boolean;
  value?: number;
  targetTemp?: number;
  locked?: boolean;
  unit?: string;
}

export interface SmartScene {
  id: string;
  name: string;
  description: string;
  actions: Array<{
    deviceId: string;
    isOn?: boolean;
    value?: number;
    targetTemp?: number;
    locked?: boolean;
  }>;
}

export interface LocalBridgeConfig {
  mode: 'on-device' | 'lan-websocket' | 'lan-rest';
  endpointUrl: string;
  localToken: string;
  lastSyncAt?: string;
}

export type AssistantMood =
  | 'serene'
  | 'warm'
  | 'encouraging'
  | 'focused'
  | 'empathetic'
  | 'playful';

export type UserEmotion =
  | 'neutral'
  | 'stressed'
  | 'tired'
  | 'happy'
  | 'urgent'
  | 'calm';

export type PersonaTemperament =
  | 'warm-companion'
  | 'calm-concierge'
  | 'upbeat-coach'
  | 'crisp-executive';

export type FormalityLevel = 'casual' | 'balanced' | 'formal';
export type LanguageMode = 'hinglish' | 'hindi' | 'english';

export interface VoiceprintSignature {
  centroidHz: number;
  spectralSpread: number;
  bandProfile: number[]; // normalized 8-band spectral fingerprint
  sampleCount: number;
  enrolledAt: string;
}

export interface OwnerProfile {
  assistantName: string;
  ownerName: string;
  callOwnerAs: string;
  languageMode: LanguageMode;
  onboardingCompleted: boolean;
  pinHash: string;
  isLocked: boolean;
  voiceLockStrict: boolean;
  voiceprint: VoiceprintSignature | null;
  customInstructions?: string;
}

export interface EmotionSettings {
  empathyLevel: number;
  expressiveness: number;
  proactiveCare: boolean;
  temperament: PersonaTemperament;
  formality: FormalityLevel;
  userName: string;
}

export type HumanVoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon';

export interface VoiceSettings {
  voiceEnabled: boolean;
  autoSpeakReplies: boolean;
  wakeWordEnabled: boolean;
  wakeWord: string;
  voiceURI: string;
  speechLang: 'en-IN' | 'hi-IN' | 'en-US';
  rate: number;
  pitch: number;
  emotionalProsody: boolean;
  chimeEnabled: boolean;
  liveVoiceMode: boolean;
  humanVoiceName: HumanVoiceName;
  micMode?: string;
  autoDeactivateEnabled?: boolean;
  autoDeactivateMinutes?: number;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  mood?: AssistantMood;
  detectedEmotion?: UserEmotion;
  actionsTaken?: string[];
}

export interface ConversationContext {
  lastDeviceId?: string;
  lastRoom?: RoomName;
  lastTaskId?: string;
}

export interface AssistantState {
  ownerProfile: OwnerProfile;
  tasks: TaskItem[];
  routines: RoutineItem[];
  devices: SmartDevice[];
  scenes: SmartScene[];
  bridge: LocalBridgeConfig;
  emotionSettings: EmotionSettings;
  voiceSettings: VoiceSettings;
  currentMood: AssistantMood;
  theme: 'light' | 'dark';
  history: ConversationTurn[];
  context: ConversationContext;
  isActivated?: boolean;
  powerEnabled?: boolean;
}
