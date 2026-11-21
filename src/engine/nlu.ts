import type {
  AssistantMood,
  AssistantState,
  ConversationContext,
  RoomName,
  SmartDevice,
  TaskCategory,
  UserEmotion,
} from '../types/assistant';
import { type AppLaunchIntent, parseAppLaunchIntent } from './appLauncher';
import {
  computeNextMood,
  describeAssistantFeeling,
  detectUserEmotion,
  shapeHumanResponse,
} from './emotion';
import { formatTime12h, getTodayDateKey } from './routines';
import { applySceneToDevices } from './smarthome';

export interface ProcessCommandResult {
  nextState: AssistantState;
  reply: string;
  detectedEmotion: UserEmotion;
  nextMood: AssistantMood;
  actionsTaken: string[];
  shouldQueryBrain: boolean;
  appAction?: AppLaunchIntent | null;
}

const ROOM_ALIASES: Array<{ room: RoomName; patterns: RegExp[] }> = [
  { room: 'Living Room', patterns: [/\bliving\s*room\b/i, /\blounge\b/i, /\bsofa\b/i, /\bhall\b/i] },
  { room: 'Bedroom', patterns: [/\bbed\s*room\b/i, /\bsleep\b/i, /\bkamra\b/i] },
  { room: 'Kitchen', patterns: [/\bkitchen\b/i, /\bcounter\b/i, /\bespresso\b/i, /\bcoffee\b/i, /\brasoi\b/i] },
  { room: 'Entryway', patterns: [/\bentry\s*way\b/i, /\bfront\s*door\b/i, /\bdoor\b/i, /\bdarwaza\b/i, /\bhallway\b/i] },
  { room: 'Office', patterns: [/\boffice\b/i, /\bdesk\b/i, /\bstudio\b/i, /\bwork\s*space\b/i] },
];

export function parseTimeFromText(text: string): string | undefined {
  const ampmMatch = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const minute = Number(ampmMatch[2] ?? '0');
    const period = ampmMatch[3].toLowerCase();
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const h24Match = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24Match) {
    return `${String(Number(h24Match[1])).padStart(2, '0')}:${h24Match[2]}`;
  }

  if (/\btonight\b|\braat\b/i.test(text)) return '20:00';
  if (/\bthis evening\b|\bshaam\b/i.test(text)) return '19:00';
  if (/\bthis afternoon\b|\bdopahar\b/i.test(text)) return '14:30';
  if (/\btomorrow morning\b|\bthis morning\b|\bsubah\b/i.test(text)) return '08:30';
  return undefined;
}

function inferCategory(title: string): TaskCategory {
  if (/\b(water|meditat|walk|stretch|vitamin|gym|run|workout|sleep|rest|doctor|pill|pani)\b/i.test(title)) {
    return 'Health';
  }
  if (/\b(fern|plant|clean|laundry|grocer|dishes|trash|repair|filter|lock|home|ghar)\b/i.test(title)) {
    return 'Home';
  }
  if (/\b(review|report|email|meeting|code|design|budget|project|draft|call client|work|kaam)\b/i.test(title)) {
    return 'Focus';
  }
  return 'Personal';
}

function splitIntoClauses(rawInput: string): string[] {
  const normalized = rawInput.trim();
  const parts = normalized.split(
    /(?:\s*;\s*|\s+(?:and then|then|and|aur|phir)\s+(?=(?:turn|switch|dim|brighten|set|lock|unlock|open|close|start|stop|run|activate|remind|add|create|schedule|mark|complete|finish|make|brew|play|pause|clear|delete|mujhe|bedroom|living|kitchen|light|darwaza)\b))/i
  );
  return parts.map((p) => p.trim()).filter(Boolean);
}

function detectRoom(clause: string): RoomName | undefined {
  for (const entry of ROOM_ALIASES) {
    if (entry.patterns.some((p) => p.test(clause))) return entry.room;
  }
  return undefined;
}

function findMatchingDevices(
  devices: SmartDevice[],
  clause: string,
  context: ConversationContext
): SmartDevice[] {
  const lower = clause.toLowerCase();
  const explicitRoom = detectRoom(clause);

  const exactNameMatches = devices.filter((d) => lower.includes(d.name.toLowerCase()));
  if (exactNameMatches.length > 0) return exactNameMatches;

  const wantsLight = /\b(lights?|lamps?|lighting|bright|dim|batti|roshni)\b/i.test(lower);
  const wantsThermostat = /\b(thermostat|temp|temperature|heat|ac|air conditioning|warm|cool|cold|freezing|hot|thand|garmi)\b/i.test(
    lower
  );
  const wantsLock = /\b(lock|unlock|front door|door|darwaza|tala)\b/i.test(lower);
  const wantsBlinds = /\b(blinds|shades|curtains|parde)\b/i.test(lower);
  const wantsCoffee = /\b(coffee|espresso|brewer)\b/i.test(lower);
  const wantsPurifier = /\b(purifier|air filter|air quality)\b/i.test(lower);
  const wantsSpeaker = /\b(speaker|music|audio|volume|gaana)\b/i.test(lower);

  if (/\ball lights\b|\bevery light\b|\bsari lights\b/i.test(lower)) {
    return devices.filter((d) => d.type === 'light');
  }

  let pool = devices;
  if (explicitRoom) {
    pool = devices.filter((d) => d.room === explicitRoom);
  }

  if (wantsThermostat) return devices.filter((d) => d.type === 'thermostat');
  if (wantsLock) return devices.filter((d) => d.type === 'lock');
  if (wantsCoffee) return devices.filter((d) => d.type === 'coffee');
  if (wantsPurifier) return devices.filter((d) => d.type === 'purifier');
  if (wantsSpeaker) return devices.filter((d) => d.type === 'speaker');
  if (wantsBlinds) return pool.filter((d) => d.type === 'blinds');
  if (wantsLight) {
    const lights = pool.filter((d) => d.type === 'light');
    if (lights.length > 0) return lights;
  }

  if (/\b(it|them|that|ise|use)\b/i.test(lower)) {
    if (context.lastDeviceId) {
      const found = devices.find((d) => d.id === context.lastDeviceId);
      if (found) return [found];
    }
    if (context.lastRoom) {
      const roomDevs = devices.filter((d) => d.room === context.lastRoom);
      if (roomDevs.length > 0) return roomDevs;
    }
  }

  if (explicitRoom && pool.length > 0) {
    return pool;
  }

  return [];
}

function cleanTaskTitle(raw: string): string {
  return raw
    .replace(/^(?:please\s+)?(?:jarvis\s*,?\s*)?/i, '')
    .replace(
      /^(?:mujhe\s+|yaad\s+dilao\s+|remind\s+me\s+(?:to\s+)?|add\s+(?:a\s+)?(?:task|reminder)\s*(?:to|:)?\s*|create\s+(?:a\s+)?(?:task|reminder)\s*(?:to|:)?\s*|schedule\s+(?:to\s+)?|i\s+need\s+to\s+|don't\s+let\s+me\s+forget\s+to\s+)/i,
      ''
    )
    .replace(/\b(?:karne\s+ka\s+reminder\s+(?:do|lagao|set\s+karo)|ka\s+reminder\s+(?:do|lagao|set\s+karo)|yaad\s+dilao|reminder\s+(?:do|lagao))\b/gi, '')
    .replace(/\s+(?:to\s+my\s+(?:tasks|list|reminders)|for\s+(?:today|tonight|this evening|this afternoon|this morning))\b/gi, '')
    .replace(/\s*(?:at|by|around|baje)?\s*(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:am|pm)\b/gi, '')
    .replace(/\s*(?:at|by|around|baje)?\s*(?:[01]?\d|2[0-3]):[0-5]\d\b/gi, '')
    .replace(/\s+\b(?:tonight|this evening|this afternoon|this morning|tomorrow morning|raat|shaam|subah)\b/gi, '')
    .replace(/[.!?]+$/, '')
    .trim();
}

function isHinglishInput(text: string): boolean {
  return /\b(karo|kya|hai|hoon|ho|mujhe|yaad|dilao|thand|garmi|baje|aaj|thoda|kaam|darwaza|kholo|band|shuru|kaise|tum|mera|meri|mere|aur|batao|bata|suno|nahi|bol|raha|rahe|rahi|baat|kuch|yeh|ye|kar|mat|haan|theek|acha|accha|madad|rupaye|refund)\b/i.test(
    text
  ) || /[\u0900-\u097F]/.test(text);
}

function isGeneralKnowledgeQuestion(clause: string): boolean {
  const lower = clause.toLowerCase().trim();
  // Local device/task/feeling inquiries should still run locally
  if (
    /\b(my tasks|my schedule|on my list|kya tasks|the temp|temperature inside|how warm is it|temperature kya|how (?:are|do) you feel|your mood|who are you|tum kaun ho|kaise ho|kya haal)\b/i.test(
      lower
    )
  ) {
    return false;
  }
  return (
    /[?？]$/.test(lower) ||
    /^(?:what|who|why|how|when|where|which|explain|tell me|define|calculate|solve|compare|translate|summarize|suggest|recommend|write|draft|is|are|can|could|would|do|does|did|kya|kaun|kon|kab|kahan|kaha|kaise|kaisa|kaisi|kaunsa|kaunsi|kyon|kyun|kitna|kitni|kitne|kisne|kisko|kiska|kiski|batao|bataiye|bata|samjhao|sunao|sikhao|pucho|likho)\b/i.test(
      lower
    ) ||
    /\b(?:kya hota|kya hai|kaun hai|kahan hai|kab hua|kaise kare|kaise hota|kaise bana|kaise banate|kyon|kyun|matlab|samjhao|batao|bataiye|bata do|sikhao|sunao|tarika|tareeka|upay|farq|difference|pros and cons|vs\.?|full form|recipe|capital of|who invented|meaning of|solve karo|calculate|ke baare mein|ke bare mein|interesting facts|tips|ideas)\b/i.test(
      lower
    ) ||
    /(?:क्या|कौन|कब|कहाँ|कहां|कैसे|क्यों|क्यूँ|कितना|कितनी|कितने|किसने|किसको|किसका|किसकी|किसके|किसे|बताओ|बताइए|बताये|बताएं|समझाओ|समझाइए|सुनाओ|सिखाओ|मतलब|परिभाषा|फायदे|नुकसान|तरीका|उपाय|इतिहास|कारण|अंतर)/.test(
      clause
    ) ||
    /\d+\s*[+\-*/×÷]\s*\d+/.test(lower)
  );
}

export function processNaturalCommand(
  state: AssistantState,
  rawInput: string,
  now: Date = new Date()
): ProcessCommandResult {
  const trimmed = rawInput.trim();
  const detectedEmotion = detectUserEmotion(trimmed);
  const pendingCount = state.tasks.filter((t) => !t.completed).length;
  const nextMood = computeNextMood(state.currentMood, detectedEmotion, state.emotionSettings, pendingCount);

  const effectiveLang =
    isHinglishInput(trimmed) && state.ownerProfile?.languageMode === 'english'
      ? 'hinglish'
      : state.ownerProfile?.languageMode ?? 'english';
  const hi = effectiveLang === 'hinglish' || effectiveLang === 'hindi';
  const callName = state.ownerProfile?.callOwnerAs || state.emotionSettings.userName || 'Sir';
  const assistantName = state.ownerProfile?.assistantName || 'JARVIS';

  if (!trimmed) {
    return {
      nextState: state,
      reply: hi
        ? `Main sun raha hoon, ${callName}. Bolo kya madad karoon?`
        : 'I am listening whenever you want to say something.',
      detectedEmotion,
      nextMood,
      actionsTaken: [],
      shouldQueryBrain: false,
    };
  }

  let nextState: AssistantState = {
    ...state,
    tasks: [...state.tasks],
    routines: [...state.routines],
    devices: state.devices.map((d) => ({ ...d })),
    emotionSettings: { ...state.emotionSettings },
    voiceSettings: { ...state.voiceSettings },
    context: { ...state.context },
    currentMood: nextMood,
  };

  const clauses = splitIntoClauses(trimmed);
  const outcomes: string[] = [];
  const actionsTaken: string[] = [];
  let primaryIntentKind = 'general';
  let hasUnmatchedConversation = false;
  let detectedAppAction: AppLaunchIntent | null = null;

  for (const clause of clauses) {
    const lower = clause.toLowerCase();

    // 0. Voice App & Web Access (Spotify, YouTube, WhatsApp, Chrome Search)
    const appIntent = parseAppLaunchIntent(clause);
    if (appIntent) {
      detectedAppAction = appIntent;
      outcomes.push(hi ? appIntent.replyHi : appIntent.replyEn);
      actionsTaken.push(`${appIntent.label}: ${appIntent.query}`);
      primaryIntentKind = 'app_launch';
      if (appIntent.summaryPrompt) {
        hasUnmatchedConversation = true;
      }
      continue;
    }

    // 1. Self-reflection / feelings / identity inquiry
    if (
      /\bhow (?:are|do) you feel\b|\bwhat(?:'s| is) your mood\b|\bwho are you\b|\bkaise ho\b|\bkya haal\b|\btum kaun ho\b/i.test(
        lower
      )
    ) {
      const feeling = describeAssistantFeeling(nextMood, nextState.emotionSettings);
      outcomes.push(
        hi
          ? `Main ${assistantName} hoon, sirf ${callName} ke liye. Abhi main ${feeling.label.toLowerCase()} feel kar raha hoon aur tumhari madad ke liye tayyar hoon.`
          : `I am ${assistantName}, dedicated exclusively to ${callName}. Right now I'm feeling ${feeling.label.toLowerCase()}. ${feeling.reflection}`
      );
      primaryIntentKind = 'feeling';
      continue;
    }

    // 2. Emotional intelligence / voice adjustments via natural speech
    if (/\b(be warmer|more empathetic|more caring)\b/i.test(lower)) {
      nextState.emotionSettings.empathyLevel = Math.min(100, nextState.emotionSettings.empathyLevel + 15);
      nextState.currentMood = 'warm';
      outcomes.push(
        hi
          ? 'Bilkul, maine apni warmth aur empathy badha di hai.'
          : 'I have dialed up my warmth and empathy so I stay more supportive.'
      );
      actionsTaken.push('Increased empathy');
      primaryIntentKind = 'eq_setting';
      continue;
    }
    if (/\b(be more concise|less chatty|more direct|crisp)\b/i.test(lower)) {
      nextState.emotionSettings.empathyLevel = Math.max(20, nextState.emotionSettings.empathyLevel - 20);
      nextState.emotionSettings.temperament = 'crisp-executive';
      nextState.currentMood = 'focused';
      outcomes.push(
        hi
          ? 'Samajh gaya. Ab main seedha aur crisp jawab dunga.'
          : 'Understood. I will keep things crisp and to the point.'
      );
      actionsTaken.push('Switched to crisp tone');
      primaryIntentKind = 'eq_setting';
      continue;
    }
    if (/\bspeak slower\b|\bslow down\b|\bdheere bolo\b/i.test(lower)) {
      nextState.voiceSettings.rate = Math.max(0.75, Number((nextState.voiceSettings.rate - 0.1).toFixed(2)));
      outcomes.push(
        hi
          ? `Ab main thoda dheere (${nextState.voiceSettings.rate}x) bolunga.`
          : `I have slowed my speaking pace to ${nextState.voiceSettings.rate}x.`
      );
      actionsTaken.push('Slowed voice rate');
      primaryIntentKind = 'voice_setting';
      continue;
    }
    if (/\bspeak faster\b|\bspeed up\b|\btez bolo\b/i.test(lower)) {
      nextState.voiceSettings.rate = Math.min(1.35, Number((nextState.voiceSettings.rate + 0.1).toFixed(2)));
      outcomes.push(
        hi
          ? `Aawaz ki speed ${nextState.voiceSettings.rate}x kar di hai.`
          : `I have sped up my speaking pace to ${nextState.voiceSettings.rate}x.`
      );
      actionsTaken.push('Increased voice rate');
      primaryIntentKind = 'voice_setting';
      continue;
    }

    // 3. Routine triggering
    const matchedRoutine = nextState.routines.find(
      (r) =>
        lower.includes(r.title.toLowerCase()) ||
        (/\bmorning routine\b/i.test(lower) && r.id === 'routine-morning') ||
        (/\b(evening|wind.?down|night) routine\b/i.test(lower) && r.id === 'routine-evening') ||
        (/\bmidday\b|\bhydration\b/i.test(lower) && r.id === 'routine-midday')
    );
    if (matchedRoutine && /\b(start|run|trigger|activate|begin|do|shuru|chalao)\b/i.test(lower)) {
      matchedRoutine.lastTriggeredDate = getTodayDateKey(now);
      let sceneSummary = '';
      if (matchedRoutine.sceneId) {
        const scene = nextState.scenes.find((s) => s.id === matchedRoutine.sceneId);
        if (scene) {
          const applied = applySceneToDevices(nextState.devices, scene);
          nextState.devices = applied.devices;
          sceneSummary = ` (${scene.name})`;
        }
      }
      outcomes.push(`Started ${matchedRoutine.title}${sceneSummary}. ${matchedRoutine.reminderMessage}`);
      actionsTaken.push(`Started ${matchedRoutine.title}`);
      primaryIntentKind = 'routine';
      continue;
    }

    // 4. Smart home scene activation
    const matchedScene = nextState.scenes.find(
      (s) =>
        lower.includes(s.name.toLowerCase()) ||
        (/\bgood\s*night\b/i.test(lower) && s.id === 'scene-goodnight') ||
        (/\bgood\s*morning\b/i.test(lower) && s.id === 'scene-morning') ||
        (/\bfocus mode\b|\bdeep focus\b/i.test(lower) && s.id === 'scene-focus')
    );
    if (matchedScene && !/\bremind\b|\byaad\b/i.test(lower)) {
      const applied = applySceneToDevices(nextState.devices, matchedScene);
      nextState.devices = applied.devices;
      outcomes.push(
        hi
          ? `${matchedScene.name} scene ${applied.updatedNames.length} devices par chalu kar diya hai.`
          : `Activated the ${matchedScene.name} scene across ${applied.updatedNames.length} devices.`
      );
      actionsTaken.push(`Scene: ${matchedScene.name}`);
      primaryIntentKind = 'device';
      continue;
    }

    // 5. Task listing / query
    if (
      /\b(what(?:'s| is) on my (?:schedule|tasks|list)|my tasks|list tasks|what do i have to do|what's left|kya tasks|kaam kya)\b/i.test(
        lower
      )
    ) {
      const active = nextState.tasks.filter((t) => !t.completed);
      if (active.length === 0) {
        outcomes.push(hi ? 'Aaj ke saare tasks complete hain.' : 'Your task list is completely clear right now.');
      } else {
        const preview = active
          .slice(0, 4)
          .map((t) => (t.dueTime ? `${t.title} (${formatTime12h(t.dueTime)})` : t.title))
          .join(', ');
        outcomes.push(
          hi
            ? `Abhi ${active.length} open tasks hain: ${preview}.`
            : `You have ${active.length} open ${active.length === 1 ? 'task' : 'tasks'}: ${preview}.`
        );
      }
      primaryIntentKind = 'task_query';
      continue;
    }

    // 6. Complete / check off task
    if (/\b(mark|check off|complete|finished|done with|ho gaya|poora hua)\b/i.test(lower)) {
      const target = nextState.tasks.find((t) => {
        if (t.completed) return false;
        const words = t.title
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        return words.some((w) => lower.includes(w));
      });
      if (target) {
        target.completed = true;
        nextState.context.lastTaskId = target.id;
        outcomes.push(
          hi ? `"${target.title}" complete mark kar diya hai.` : `Marked "${target.title}" as completed.`
        );
        actionsTaken.push(`Completed: ${target.title}`);
        primaryIntentKind = 'task_complete';
        continue;
      }
    }

    // 7. Add task / personalized reminder
    const isExplicitReminderOrTask =
      /\b(remind me|add .*?(?:task|reminder)|schedule|don't let me forget|yaad dilao|reminder lagao|reminder do|task add)\b/i.test(
        lower
      ) ||
      /\bi need to\s+(?!know\b|understand\b|learn\b|ask\b|find out\b|check\b|see\b)/i.test(lower);
    if (isExplicitReminderOrTask && !(isGeneralKnowledgeQuestion(clause) && !/\b(remind|reminder|yaad|task|schedule)\b/i.test(lower))) {
      const dueTime = parseTimeFromText(clause);
      let title = cleanTaskTitle(clause);
      if (!title) title = 'Personal reminder';
      title = title.charAt(0).toUpperCase() + title.slice(1);
      const newTask = {
        id: `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title,
        dueTime,
        category: inferCategory(title),
        priority: /\b(urgent|important|high priority|must|zaroori)\b/i.test(clause)
          ? ('high' as const)
          : ('normal' as const),
        completed: false,
        isReminder: /\bremind\b|\byaad\b|\breminder\b/i.test(lower),
        createdAt: now.toISOString(),
      };
      nextState.tasks.unshift(newTask);
      nextState.context.lastTaskId = newTask.id;
      const timePhrase = dueTime ? ` (${formatTime12h(dueTime)})` : '';
      outcomes.push(
        hi
          ? `"${title}"${timePhrase} tumhari reminder list mein add kar diya hai.`
          : `Added "${title}"${dueTime ? ` for ${formatTime12h(dueTime)}` : ''} to your tasks.`
      );
      actionsTaken.push(`Added task: ${title}`);
      primaryIntentKind = 'task_add';
      continue;
    }

    // 8. Clear completed tasks
    if (/\bclear completed\b|\bremove done tasks\b|\bcompleted hatao\b/i.test(lower)) {
      const before = nextState.tasks.length;
      nextState.tasks = nextState.tasks.filter((t) => !t.completed);
      const removed = before - nextState.tasks.length;
      outcomes.push(
        removed > 0
          ? `Cleared ${removed} completed ${removed === 1 ? 'task' : 'tasks'}.`
          : 'There were no completed tasks to clear.'
      );
      if (removed > 0) actionsTaken.push(`Cleared ${removed} tasks`);
      primaryIntentKind = 'task_clear';
      continue;
    }

    // 9. Smart home comfort / device commands (skip if clause is a general knowledge question)
    if (/\b(what(?:'s| is) the temp|temperature inside|how warm is it|temperature kya)\b/i.test(lower)) {
      const therm = nextState.devices.find((d) => d.type === 'thermostat');
      if (therm) {
        outcomes.push(
          hi
            ? `${therm.name} abhi ${therm.targetTemp ?? therm.value ?? 21}°C par set hai.`
            : `The ${therm.name} is currently set to ${therm.targetTemp ?? therm.value ?? 21}°C.`
        );
        nextState.context.lastDeviceId = therm.id;
        nextState.context.lastRoom = therm.room;
        primaryIntentKind = 'device_query';
        continue;
      }
    }

    if (/\b(i'm cold|i am cold|freezing|chilly|too cold|thand lag)\b/i.test(lower)) {
      const therm = nextState.devices.find((d) => d.type === 'thermostat');
      if (therm) {
        const nextTemp = Math.min(27, (therm.targetTemp ?? 21) + 1.5);
        therm.isOn = true;
        therm.targetTemp = nextTemp;
        therm.value = nextTemp;
        nextState.context.lastDeviceId = therm.id;
        outcomes.push(
          hi
            ? `Thermostat ko ${nextTemp}°C par badha diya hai taaki kamra garam rahe.`
            : `I nudged the thermostat up to ${nextTemp}°C so it warms up comfortably.`
        );
        actionsTaken.push(`Thermostat → ${nextTemp}°C`);
        primaryIntentKind = 'device';
        continue;
      }
    }

    if (/\b(too warm|too hot|i'm hot|stuffy|garmi lag)\b/i.test(lower)) {
      const therm = nextState.devices.find((d) => d.type === 'thermostat');
      if (therm) {
        const nextTemp = Math.max(16, (therm.targetTemp ?? 21) - 1.5);
        therm.isOn = true;
        therm.targetTemp = nextTemp;
        therm.value = nextTemp;
        nextState.context.lastDeviceId = therm.id;
        outcomes.push(
          hi
            ? `Thermostat ko ${nextTemp}°C par kam kar diya hai.`
            : `I lowered the thermostat to ${nextTemp}°C to cool the room down.`
        );
        actionsTaken.push(`Thermostat → ${nextTemp}°C`);
        primaryIntentKind = 'device';
        continue;
      }
    }

    const matchedDevices = isGeneralKnowledgeQuestion(clause)
      ? []
      : findMatchingDevices(nextState.devices, clause, nextState.context);
    if (matchedDevices.length > 0) {
      const percentMatch = clause.match(/(\d{1,3})\s*%/);
      const tempMatch =
        clause.match(/(\d{2}(?:\.\d)?)\s*(?:°|deg|degrees|c\b)/i) ||
        (/\bthermostat\b/i.test(lower) ? clause.match(/\b(1[6-9]|2[0-8](?:\.\d)?)\b/) : null);

      const wantsOff = /\b(turn off|switch off|power off|shut off|off karo|band karo|band)\b|\boff$/i.test(lower);
      const wantsOn =
        /\b(turn on|switch on|power on|brew|start|on karo|chalao|chalu karo|light on|lights on|lamp on)\b|\bon(?:\s+\d{1,3}%)?$/i.test(
          lower
        ) || /\b(?:turn|switch)\b.*\bon\b/i.test(lower);
      const wantsLock = /\block\b/i.test(lower) && !/\bunlock\b/i.test(lower);
      const wantsUnlock = /\bunlock\b|\bkholo\b/i.test(lower);
      const wantsDim = /\b(dim|lower|softer|too bright|kam karo)\b/i.test(lower);
      const wantsBright = /\b(brighten|raise|too dark|max|tez karo)\b/i.test(lower);
      const wantsOpen = /\bopen\b|\bkholo\b/i.test(lower);
      const wantsClose = /\bclose\b|\bband\b/i.test(lower);

      const updatedLabels: string[] = [];
      for (const dev of matchedDevices) {
        nextState.context.lastDeviceId = dev.id;
        nextState.context.lastRoom = dev.room;

        if (dev.type === 'lock') {
          if (wantsUnlock || wantsOpen) {
            dev.locked = false;
            dev.isOn = true;
            updatedLabels.push(`${dev.name} unlocked`);
          } else {
            dev.locked = true;
            dev.isOn = true;
            updatedLabels.push(`${dev.name} locked`);
          }
          continue;
        }

        if (dev.type === 'thermostat' && tempMatch) {
          const target = Math.min(28, Math.max(16, Number(tempMatch[1])));
          dev.isOn = true;
          dev.targetTemp = target;
          dev.value = target;
          updatedLabels.push(`${dev.name} set to ${target}°C`);
          continue;
        }

        if (dev.type === 'blinds') {
          if (wantsClose || wantsOff) {
            dev.isOn = false;
            dev.value = 0;
            updatedLabels.push(`${dev.name} closed`);
          } else if (percentMatch) {
            const pct = Math.min(100, Math.max(0, Number(percentMatch[1])));
            dev.isOn = pct > 0;
            dev.value = pct;
            updatedLabels.push(`${dev.name} at ${pct}%`);
          } else {
            dev.isOn = true;
            dev.value = 100;
            updatedLabels.push(`${dev.name} opened`);
          }
          continue;
        }

        if (percentMatch && dev.value !== undefined) {
          const pct = Math.min(100, Math.max(0, Number(percentMatch[1])));
          dev.isOn = pct > 0;
          dev.value = pct;
          updatedLabels.push(`${dev.name} ${pct > 0 ? `at ${pct}%` : 'off'}`);
        } else if (wantsOff && !wantsOn) {
          dev.isOn = false;
          updatedLabels.push(`${dev.name} off`);
        } else if (wantsDim && dev.value !== undefined) {
          dev.isOn = true;
          dev.value = Math.max(15, dev.value - 25);
          updatedLabels.push(`${dev.name} dimmed to ${dev.value}%`);
        } else if (wantsBright && dev.value !== undefined) {
          dev.isOn = true;
          dev.value = Math.min(100, dev.value + 25);
          updatedLabels.push(`${dev.name} brightened to ${dev.value}%`);
        } else if (wantsOn || wantsLock === false) {
          dev.isOn = true;
          if (dev.value !== undefined && dev.value === 0) dev.value = 60;
          updatedLabels.push(
            dev.value !== undefined ? `${dev.name} on (${dev.value}%)` : `${dev.name} on`
          );
        }
      }

      if (updatedLabels.length > 0) {
        outcomes.push(
          hi ? `Ho gaya: ${updatedLabels.join(', ')}.` : `Done: ${updatedLabels.join(', ')}.`
        );
        actionsTaken.push(...updatedLabels);
        primaryIntentKind = 'device';
        continue;
      }
    }

    // 10. Greetings (only when utterance is purely a short greeting, not a question) & emotional check-ins
    const wordCount = lower.split(/\s+/).filter(Boolean).length;
    const looksLikeQuestion = isGeneralKnowledgeQuestion(clause);
    if (
      wordCount <= 4 &&
      !looksLikeQuestion &&
      /\b(hello|hi|hey|good morning|good afternoon|good evening|namaste)\b|नमस्ते|हेलो/i.test(lower)
    ) {
      const hour = now.getHours();
      const timeLabel = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
      outcomes.push(
        hi
          ? `Namaste ${callName}, abhi ${pendingCount} open tasks hain. Bolo aaj kya help karoon?`
          : `Good ${timeLabel}. You have ${pendingCount} open ${
              pendingCount === 1 ? 'task' : 'tasks'
            } today—just tell me what you'd like to tackle or adjust at home.`
      );
      primaryIntentKind = 'greeting';
      continue;
    }

    if (
      !looksLikeQuestion &&
      wordCount <= 10 &&
      (detectedEmotion === 'stressed' || detectedEmotion === 'tired')
    ) {
      outcomes.push(
        hi
          ? `Sab ek saath karne ki zaroorat nahi hai. Ek kaam batao jo main abhi sambhal loon, ya main lights dim kar doon.`
          : `You don't have to carry everything at once. Tell me one thing to take off your plate, or I can soften the lights and cue a quiet break.`
      );
      primaryIntentKind = 'emotional_support';
      continue;
    }

    if (!looksLikeQuestion && wordCount <= 6 && detectedEmotion === 'happy') {
      outcomes.push(
        hi
          ? `Yeh sunkar dil khush ho gaya! Bolo aage kya plan hai?`
          : `I'm glad things are going well! Let me know if you want to capture any wins or queue up your next focus block.`
      );
      primaryIntentKind = 'emotional_support';
      continue;
    }

    hasUnmatchedConversation = true;
    const mathMatch = clause.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/×÷])\s*(-?\d+(?:\.\d+)?)/);
    let mathAnswer: string | null = null;
    if (mathMatch) {
      const a = Number(mathMatch[1]);
      const op = mathMatch[2];
      const b = Number(mathMatch[3]);
      let resNum: number | null = null;
      if (op === '+') resNum = a + b;
      else if (op === '-') resNum = a - b;
      else if (op === '*' || op === '×') resNum = a * b;
      else if ((op === '/' || op === '÷') && b !== 0) resNum = a / b;
      if (resNum !== null && Number.isFinite(resNum)) {
        const formatted = Number.isInteger(resNum) ? String(resNum) : Number(resNum.toFixed(4)).toString();
        mathAnswer = hi
          ? `${callName}, ${a} ${op} ${b} ka jawab ${formatted} hota hai.`
          : `${callName}, ${a} ${op} ${b} equals ${formatted}.`;
      }
    }
    outcomes.push(
      mathAnswer ??
        (hi
          ? `${callName}, abhi server se jawab milne mein rukawat aayi — ek baar internet check karke phir pucho.`
          : `${callName}, I couldn't reach the answer service just now—please check your connection and ask once more.`)
    );
  }

  const coreOutcome = outcomes.join(' ');
  const finalPending = nextState.tasks.filter((t) => !t.completed).length;
  const reply = shapeHumanResponse(coreOutcome, {
    mood: nextMood,
    userEmotion: detectedEmotion,
    settings: nextState.emotionSettings,
    intentKind: primaryIntentKind,
    pendingTaskCount: finalPending,
    languageMode: effectiveLang,
  });

  nextState.history = [
    ...nextState.history,
    {
      id: `user-${now.getTime()}`,
      role: 'user' as const,
      text: trimmed,
      timestamp: now.toISOString(),
      detectedEmotion,
    },
    {
      id: `asst-${now.getTime() + 1}`,
      role: 'assistant' as const,
      text: reply,
      timestamp: new Date(now.getTime() + 1).toISOString(),
      mood: nextMood,
      actionsTaken: actionsTaken.length > 0 ? actionsTaken : undefined,
    },
  ].slice(-40);

  return {
    nextState,
    reply,
    detectedEmotion,
    nextMood,
    actionsTaken,
    shouldQueryBrain: hasUnmatchedConversation,
    appAction: detectedAppAction,
  };
}
