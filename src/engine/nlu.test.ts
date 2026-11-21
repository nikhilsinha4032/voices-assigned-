import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../data/seed';
import { filterRecentConversationTurns } from './conversationFilter';
import {
  computeEmotionalProsody,
  computeNextMood,
  detectUserEmotion,
} from './emotion';
import { parseTimeFromText, processNaturalCommand } from './nlu';
import { getDueRoutines } from './routines';
import {
  parseVoiceActivationAlternatives,
  parseVoiceActivationCommand,
} from './voiceActivation';
import { computeSpectralSignature, hashPin, matchVoiceprint, verifyPin } from './voiceprint';
import { streamChatWithRetry } from '../services/brainClient';

test('detects user emotions accurately in English and Hinglish', () => {
  assert.equal(detectUserEmotion('I feel so overwhelmed with work today'), 'stressed');
  assert.equal(detectUserEmotion('Aaj bahut pareshan aur tension mein hoon'), 'stressed');
  assert.equal(detectUserEmotion('Really exhausted after a long day'), 'tired');
  assert.equal(detectUserEmotion('Bahut thak gaya hoon yaar'), 'tired');
  assert.equal(detectUserEmotion('Feeling great and energized!'), 'happy');
  assert.equal(detectUserEmotion('Need this done urgently right now'), 'urgent');
  assert.equal(detectUserEmotion('Turn on the kitchen light'), 'neutral');
});

test('computes emotional prosody adjustments when enabled', () => {
  const state = createInitialState();
  const gentle = computeEmotionalProsody(
    'empathetic',
    'tired',
    state.emotionSettings,
    state.voiceSettings
  );
  const bright = computeEmotionalProsody(
    'playful',
    'happy',
    state.emotionSettings,
    state.voiceSettings
  );
  assert.ok(gentle.rate < state.voiceSettings.rate);
  assert.ok(bright.pitch > gentle.pitch);
  assert.equal(gentle.pauseStyle, 'gentle');
  assert.equal(bright.pauseStyle, 'bright');
});

test('parses compound command for smart home light and reminder task', () => {
  const state = createInitialState();
  const result = processNaturalCommand(
    state,
    'Turn on the bedroom lights to 40% and remind me to meditate at 9 pm',
    new Date('2026-11-15T10:00:00.000Z')
  );

  const bedroomLamp = result.nextState.devices.find((d) => d.id === 'dev-bedroom-lamp');
  assert.ok(bedroomLamp);
  assert.equal(bedroomLamp.isOn, true);
  assert.equal(bedroomLamp.value, 40);

  const addedTask = result.nextState.tasks.find((t) => t.title.toLowerCase().includes('meditate'));
  assert.ok(addedTask);
  assert.equal(addedTask.dueTime, '21:00');
  assert.equal(addedTask.isReminder, true);
  assert.ok(result.actionsTaken.length >= 2);
});

test('handles Hinglish compound smart home and reminder commands', () => {
  const state = createInitialState();
  const result = processNaturalCommand(
    state,
    'Bedroom light on karo 50% aur mujhe 8 pm pani peene ka reminder do',
    new Date('2026-11-15T10:00:00.000Z')
  );

  const bedroomLamp = result.nextState.devices.find((d) => d.id === 'dev-bedroom-lamp');
  assert.equal(bedroomLamp?.isOn, true);
  assert.equal(bedroomLamp?.value, 50);

  const addedTask = result.nextState.tasks.find((t) => t.title.toLowerCase().includes('pani'));
  assert.ok(addedTask);
  assert.equal(addedTask.dueTime, '20:00');
});

test('resolves contextual pronoun across consecutive turns', () => {
  const state = createInitialState();
  const turn1 = processNaturalCommand(state, 'Turn on the kitchen counter light');
  const kitchenLight1 = turn1.nextState.devices.find((d) => d.id === 'dev-kitchen-light');
  assert.equal(kitchenLight1?.isOn, true);

  const turn2 = processNaturalCommand(turn1.nextState, 'Dim it to 25%');
  const kitchenLight2 = turn2.nextState.devices.find((d) => d.id === 'dev-kitchen-light');
  assert.equal(kitchenLight2?.value, 25);
});

test('handles comfort complaints and Goodnight scene', () => {
  const state = createInitialState();
  const coldTurn = processNaturalCommand(state, 'Thand lag rahi hai');
  const therm = coldTurn.nextState.devices.find((d) => d.type === 'thermostat');
  assert.equal(therm?.targetTemp, 22.5);

  const nightTurn = processNaturalCommand(coldTurn.nextState, 'Goodnight');
  const lock = nightTurn.nextState.devices.find((d) => d.id === 'dev-front-lock');
  const livingLight = nightTurn.nextState.devices.find((d) => d.id === 'dev-living-light');
  assert.equal(lock?.locked, true);
  assert.equal(livingLight?.isOn, false);
});

test('shifts mood to empathetic on stressed user input and completes tasks', () => {
  const state = createInitialState();
  const nextMood = computeNextMood('warm', 'stressed', state.emotionSettings, 4);
  assert.equal(nextMood, 'empathetic');

  const doneTurn = processNaturalCommand(state, 'Mark quarterly architecture notes done');
  const task1 = doneTurn.nextState.tasks.find((t) => t.id === 'task-1');
  assert.equal(task1?.completed, true);
});

test('parses 12h and 24h times and detects due routines', () => {
  assert.equal(parseTimeFromText('Remind me at 8:30 am'), '08:30');
  assert.equal(parseTimeFromText('Remind me at 6 pm'), '18:00');

  const state = createInitialState();
  const due = getDueRoutines(state.routines, new Date(2026, 10, 15, 13, 0, 0));
  assert.equal(due.length, 1);
  assert.equal(due[0].id, 'routine-midday');
});

test('verifies private PIN hashing and spectral voiceprint matching', () => {
  const stored = hashPin('4829');
  assert.equal(verifyPin('4829', stored), true);
  assert.equal(verifyPin('0000', stored), false);

  const makeFrames = (peakBin: number) =>
    Array.from({ length: 5 }, () =>
      Array.from({ length: 512 }, (_, idx) => Math.max(0, 160 - Math.abs(idx - peakBin) * 8))
    );

  const ownerSig = computeSpectralSignature(makeFrames(18), 48000, 2048);
  const sameOwnerSig = computeSpectralSignature(makeFrames(19), 48000, 2048);
  const intruderSig = computeSpectralSignature(makeFrames(95), 48000, 2048);

  assert.ok(ownerSig && sameOwnerSig && intruderSig);
  const selfMatch = matchVoiceprint(ownerSig, sameOwnerSig);
  const intruderMatch = matchVoiceprint(ownerSig, intruderSig);

  assert.equal(selfMatch.matched, true);
  assert.ok(selfMatch.confidence > 0.85);
  assert.equal(intruderMatch.matched, false);
});

test('activates and deactivates by custom chosen assistant name', () => {
  assert.deepEqual(parseVoiceActivationCommand('Jarvis', 'JARVIS', false), {
    type: 'activate',
    command: '',
  });
  assert.deepEqual(parseVoiceActivationCommand('Jarvis.', 'JARVIS', false), {
    type: 'activate',
    command: '',
  });
  assert.deepEqual(parseVoiceActivationCommand('जार्विस।', 'JARVIS', false), {
    type: 'activate',
    command: '',
  });
  assert.deepEqual(parseVoiceActivationCommand('Hey Ayushi aaj kya plan hai', 'AYUSHI', false), {
    type: 'activate',
    command: 'aaj kya plan hai',
  });
  assert.deepEqual(parseVoiceActivationCommand('random noise without name', 'AYUSHI', false), {
    type: 'ignore',
  });
  assert.deepEqual(parseVoiceActivationCommand('solve this math problem', 'AYUSHI', true), {
    type: 'command',
    command: 'solve this math problem',
  });
  assert.deepEqual(parseVoiceActivationCommand('what is 15 * 12?', 'JARVIS', true), {
    type: 'command',
    command: 'what is 15 * 12?',
  });
  assert.deepEqual(parseVoiceActivationCommand('Jarvis band ho jao', 'JARVIS', true), {
    type: 'deactivate',
  });
  assert.deepEqual(parseVoiceActivationCommand('sleep', 'AYUSHI', true), {
    type: 'deactivate',
  });
});

test('boosts wake-word sensitivity for phonetic, split-word, and SpeechRecognition alternatives', () => {
  // Split two-word recognition ("jar vis")
  assert.deepEqual(parseVoiceActivationCommand('jar vis what is the time', 'JARVIS', false), {
    type: 'activate',
    command: 'what is the time',
  });

  // Phonetic & fuzzy variants
  assert.deepEqual(parseVoiceActivationCommand('garvis turn on kitchen light', 'JARVIS', false), {
    type: 'activate',
    command: 'turn on kitchen light',
  });
  assert.deepEqual(parseVoiceActivationCommand('hey service set timer', 'JARVIS', false), {
    type: 'activate',
    command: 'set timer',
  });
  assert.deepEqual(parseVoiceActivationCommand('Aayushi good morning', 'AYUSHI', false), {
    type: 'activate',
    command: 'good morning',
  });

  // Does not false-trigger on plain unrelated speech in standby
  assert.deepEqual(parseVoiceActivationCommand('customer service number please', 'JARVIS', false), {
    type: 'ignore',
  });

  // Multi-alternative picking ("jar bus" alt 0, "Jarvis" alt 1)
  const altRes = parseVoiceActivationAlternatives(
    ['jar bus open office light', 'Jarvis open office light'],
    'JARVIS',
    false
  );
  assert.deepEqual(altRes.action, {
    type: 'activate',
    command: 'open office light',
  });
});

test('flags open-ended questions for brain response while executing local commands immediately', () => {
  const state = createInitialState();
  const cmdRes = processNaturalCommand(state, 'Turn on kitchen light');
  assert.equal(cmdRes.shouldQueryBrain, false);

  const qaRes = processNaturalCommand(state, 'Explain why the sky looks blue in simple Hindi');
  assert.equal(qaRes.shouldQueryBrain, true);

  const heyQa = processNaturalCommand(state, 'Hey, what is 25 * 48?');
  assert.equal(heyQa.shouldQueryBrain, true);

  const coffeeQa = processNaturalCommand(state, 'What are the effects of coffee on sleep?');
  assert.equal(coffeeQa.shouldQueryBrain, true);
  assert.equal(coffeeQa.actionsTaken.length, 0);
});

test('packages downloadable customizable laptop source zip without secrets', async () => {
  const { createProjectSourceZip } = await import('../../serverZip.ts');
  const buf = createProjectSourceZip(process.cwd());
  assert.ok(buf.length > 10000);
  // PKZIP magic header: PK\x03\x04
  assert.equal(buf[0], 0x50);
  assert.equal(buf[1], 0x4b);
  assert.equal(buf[2], 0x03);
  assert.equal(buf[3], 0x04);
  const text = buf.toString('latin1');
  assert.ok(text.includes('jarvis-personal-assistant/package.json'));
  assert.ok(text.includes('jarvis-personal-assistant/README-LAPTOP-SETUP.md'));
  assert.equal(text.includes('jarvis-personal-assistant/.env\0'), false);
});

test('parses voice commands for WhatsApp, Spotify mood music, YouTube music, and Chrome search', () => {
  const state = createInitialState();

  const waRes = processNaturalCommand(state, 'WhatsApp on kar do');
  assert.equal(waRes.shouldQueryBrain, false);
  assert.equal(waRes.appAction?.target, 'whatsapp');
  assert.equal(waRes.appAction?.webUrl, 'https://web.whatsapp.com/');
  assert.equal(waRes.appAction?.appUri, 'whatsapp://');

  const spMoodRes = processNaturalCommand(
    state,
    'Spotify se music on kar do koi achha sa jisse mind fresh ho jaye'
  );
  assert.equal(spMoodRes.shouldQueryBrain, false);
  assert.equal(spMoodRes.appAction?.target, 'spotify');
  assert.ok(spMoodRes.appAction?.webUrl.startsWith('https://open.spotify.com/search/'));
  assert.ok(spMoodRes.appAction?.appUri?.startsWith('spotify:search:'));

  const ytRes = processNaturalCommand(state, 'YouTube se music on kar do');
  assert.equal(ytRes.shouldQueryBrain, false);
  assert.equal(ytRes.appAction?.target, 'youtube');
  assert.ok(ytRes.appAction?.webUrl.startsWith('https://www.youtube.com/results?search_query='));

  const chromeRes = processNaturalCommand(
    state,
    'Chrome browser se best laptop under 50000 search karke dikhao'
  );
  assert.equal(chromeRes.shouldQueryBrain, true);
  assert.equal(chromeRes.appAction?.target, 'chrome');
  assert.equal(
    chromeRes.appAction?.webUrl,
    'https://www.google.com/search?q=best%20laptop%20under%2050000'
  );
  assert.ok(chromeRes.appAction?.summaryPrompt?.includes('best laptop under 50000'));

  const artistRes = processNaturalCommand(state, 'Spotify pe Arijit Singh ka gaana chalao');
  assert.equal(artistRes.appAction?.target, 'spotify');
  assert.equal(artistRes.appAction?.query, 'Arijit Singh');
});

test('routes Hindi Devanagari and Hinglish questions to AI brain without repeating main yahin hoon', () => {
  const state = createInitialState();

  const hindiQ = processNaturalCommand(state, 'भारत का प्रधानमंत्री कौन है');
  assert.equal(hindiQ.shouldQueryBrain, true);
  assert.equal(/main yahin hoon/i.test(hindiQ.reply), false);

  const happyQ = processNaturalCommand(state, 'Khush rehne ke sabse acche tarike batao');
  assert.equal(happyQ.shouldQueryBrain, true);

  const stressQ = processNaturalCommand(state, 'Aaj bahut tension hai exam pass karne ke tips batao');
  assert.equal(stressQ.shouldQueryBrain, true);

  const greetQ = processNaturalCommand(state, 'Hello Bharat ka PM kaun hai');
  assert.equal(greetQ.shouldQueryBrain, true);
});

test('parses Google Drive open and search voice commands before generic Google web search', () => {
  const state = createInitialState();

  const openDrive = processNaturalCommand(state, 'Google Drive open kar do');
  assert.equal(openDrive.shouldQueryBrain, false);
  assert.equal(openDrive.appAction?.target, 'drive');
  assert.equal(openDrive.appAction?.webUrl, 'https://drive.google.com/');

  const searchDrive = processNaturalCommand(state, 'Google Drive mein budget report search karo');
  assert.equal(searchDrive.shouldQueryBrain, false);
  assert.equal(searchDrive.appAction?.target, 'drive');
  assert.equal(searchDrive.appAction?.query, 'budget report');
  assert.ok(searchDrive.appAction?.webUrl.includes('drive.google.com/drive/search?q=budget%20report'));
});

test('filterRecentConversationTurns preserves valid user questions and strips assistant presence/error boilerplate', () => {
  const filtered = filterRecentConversationTurns([
    { role: 'assistant', text: 'Aaram se Nikhil, main yahin hoon. Hum ek-ek karke sab handle kar lenge.' },
    { role: 'user', text: 'Main yahin hoon se tumhara kya matlab tha?' },
    { role: 'assistant', text: 'Haan Nikhil, main active hoon.' },
    { role: 'assistant', text: '...' },
    { role: 'user', text: 'Main sun raha hoon, ab mujhe Newton ke 3 laws samjhao.' },
    { role: 'assistant', text: 'Newton ke teen laws of motion inertia, F=ma, aur action-reaction par based hain.' },
  ]);

  assert.equal(filtered.length, 3);
  assert.equal(filtered[0].role, 'user');
  assert.equal(filtered[0].text, 'Main yahin hoon se tumhara kya matlab tha?');
  assert.equal(filtered[1].role, 'user');
  assert.equal(filtered[1].text, 'Main sun raha hoon, ab mujhe Newton ke 3 laws samjhao.');
  assert.equal(filtered[2].role, 'assistant');
  assert.ok(filtered[2].text.includes('Newton'));
});

test('routes informational queries with emotion or need phrases directly to brain without main yahin hoon fallback', () => {
  const state = createInitialState();

  const needToKnow = processNaturalCommand(state, 'I need to know how photosynthesis works');
  assert.equal(needToKnow.shouldQueryBrain, true);
  assert.equal(needToKnow.actionsTaken.length, 0);

  const stressedQuery = processNaturalCommand(state, 'Aaj bahut tension hai exam ke liye study tips batao');
  assert.equal(stressedQuery.shouldQueryBrain, true);
  assert.equal(/main yahin hoon/i.test(stressedQuery.reply), false);

  const factNoQMark = processNaturalCommand(state, 'Space ke baare mein interesting facts');
  assert.equal(factNoQMark.shouldQueryBrain, true);
});

test('streamChatWithRetry auto-retries when SSE drops before done flag and respects keep-alive pings', async () => {
  const encoder = new TextEncoder();
  const payload = {
    prompt: 'What is gravity?',
    assistantName: 'JARVIS',
    callOwnerAs: 'Sir',
    languageMode: 'english',
    mood: 'warm',
    customInstructions: '',
    useSearchGrounding: false,
    recentTurns: [],
  };

  let callCount = 0;
  const mockFetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      // Simulate premature EOF after partial chunk with NO done flag
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"chunk":"Gravity is "}\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    // Attempt 2 sends a keep-alive heartbeat, then completes with done: true
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        await new Promise((r) => setTimeout(r, 35));
        controller.enqueue(encoder.encode('data: {"keepAlive":true}\n\n'));
        await new Promise((r) => setTimeout(r, 35));
        controller.enqueue(encoder.encode('data: {"chunk":"Gravity is the force of attraction between masses."}\n\n'));
        controller.enqueue(encoder.encode('data: {"done":true,"reply":"Gravity is the force of attraction between masses."}\n\n'));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as unknown as typeof fetch;

  const deltas: string[] = [];
  const reply = await streamChatWithRetry({
    payload,
    signal: new AbortController().signal,
    onDelta: (d) => deltas.push(d),
    fetchFn: mockFetch,
    maxStreamAttempts: 2,
    keepAliveTimeoutMs: 60, // shorter than total duration (70ms), succeeds because keepAlive resets timer
    retryDelayMs: 10,
  });

  assert.equal(callCount, 2);
  assert.equal(reply, 'Gravity is the force of attraction between masses.');
  assert.ok(deltas.some((d) => d.includes('force of attraction')));
});

test('streamChatWithRetry falls back to non-stream JSON after repeated SSE interruptions and cancels on abort', async () => {
  const encoder = new TextEncoder();
  const payload = {
    prompt: 'What is 7 * 8?',
    assistantName: 'JARVIS',
    callOwnerAs: 'Sir',
    languageMode: 'english',
    mood: 'warm',
    customInstructions: '',
    useSearchGrounding: false,
    recentTurns: [],
  };

  let sseCalls = 0;
  let nonStreamCalls = 0;
  const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body || '{}')) as { stream?: boolean };
    if (parsed.stream) {
      sseCalls += 1;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"error":"Transient stream drop"}\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    nonStreamCalls += 1;
    return new Response(JSON.stringify({ reply: '7 times 8 is 56, Sir.' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  const reply = await streamChatWithRetry({
    payload,
    signal: new AbortController().signal,
    fetchFn: mockFetch,
    maxStreamAttempts: 2,
    retryDelayMs: 5,
  });

  assert.equal(sseCalls, 2);
  assert.equal(nonStreamCalls, 1);
  assert.equal(reply, '7 times 8 is 56, Sir.');

  const abortCtrl = new AbortController();
  abortCtrl.abort();
  const abortedReply = await streamChatWithRetry({
    payload,
    signal: abortCtrl.signal,
    fetchFn: mockFetch,
  });
  assert.equal(abortedReply, null);
});




