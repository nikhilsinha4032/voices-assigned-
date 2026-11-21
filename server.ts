import 'dotenv/config';
import { execFile } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { GoogleGenAI, Modality, ThinkingLevel, type LiveServerMessage } from '@google/genai';
import { createProjectSourceZip } from './serverZip.ts';
import { filterRecentConversationTurns } from './src/engine/conversationFilter.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

let cachedAi: GoogleGenAI | null | undefined;
let cachedTtsAi: GoogleGenAI | null | undefined;

function getGeminiClient(): GoogleGenAI | null {
  if (cachedAi !== undefined) return cachedAi;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    cachedAi = null;
    return null;
  }
  cachedAi = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return cachedAi;
}

function getGeminiTtsClient(): GoogleGenAI | null {
  if (cachedTtsAi !== undefined) return cachedTtsAi;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    cachedTtsAi = null;
    return null;
  }
  cachedTtsAi = new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return cachedTtsAi;
}

function buildPersonaInstruction(opts: {
  assistantName?: string;
  callOwnerAs?: string;
  languageMode?: string;
  mood?: string;
  customInstructions?: string;
}): string {
  const assistantName = (opts.assistantName || 'JARVIS').trim();
  const callOwnerAs = (opts.callOwnerAs || 'Sir').trim();
  const lang = opts.languageMode || 'hinglish';
  const mood = opts.mood || 'warm';
  const custom = (opts.customInstructions || '').trim();

  const langGuidance =
    lang === 'hindi'
      ? 'Respond naturally in warm, polite everyday Hindi.'
      : lang === 'english'
      ? 'Respond in warm, natural, conversational English.'
      : 'Respond in natural, friendly Hinglish (easy Hindi + English mix in Roman script) just like a caring close friend.';

  return [
    `You are ${assistantName}, a fast, accurate, and friendly personal AI assistant exclusively for ${callOwnerAs}.`,
    `Treat the user's latest message as an active question, request, or topic and answer it directly and substantively on your very first word.`,
    `Give ONE crisp, complete response (1 to 3 clear sentences max unless steps are explicitly requested).`,
    `Avoid empty greetings, availability/presence checks, stalling, repetition, or trailing small-talk.`,
    `Verify all facts, math, dates, code, and practical logic before replying.`,
    `Speak naturally like a helpful human without markdown bullets or asterisks.`,
    `Current emotional tone: ${mood}.`,
    langGuidance,
    custom ? `Owner's custom instructions: ${custom}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function buildVoiceStyle(mood?: string): string {
  switch (mood) {
    case 'empathetic':
      return 'Gentle, caring, reassuring real human voice speaking softly and warmly';
    case 'encouraging':
      return 'Warm, upbeat, friendly human voice speaking clearly and naturally';
    case 'focused':
      return 'Calm, natural, articulate human voice speaking smoothly at a relaxed pace';
    default:
      return 'Warm, soft, natural everyday human companion speaking effortlessly with gentle pauses—never robotic';
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  let ttsQuotaCooldownUntil = 0;
  let hydrogenQuotaCooldownUntil = 0;
  let searchGroundingCooldownUntil = 0;

  app.get('/api/health', (_req, res) => {
    const ai = getGeminiClient();
    const ttsAi = getGeminiTtsClient();
    res.json({
      ok: true,
      liveReady: Boolean(ai),
      ttsReady: Boolean(ttsAi) && Date.now() >= ttsQuotaCooldownUntil,
    });
  });

  // Download full customizable source code bundle for laptop
  app.get('/api/download-source', (_req, res) => {
    try {
      const zipBuffer = createProjectSourceZip(__dirname);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="jarvis-personal-assistant.zip"'
      );
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to package source archive.';
      res.status(500).json({ error: message });
    }
  });

  // Optional native desktop app/browser launch when running locally on the user's laptop
  app.post('/api/open-app', (req, res) => {
    const { webUrl, appUri } = req.body as { webUrl?: string; appUri?: string };
    const candidate = (appUri || webUrl || '').trim();
    const isAllowed = /^(https?:\/\/|spotify:|whatsapp:)/i.test(candidate);
    if (!isAllowed) {
      res.status(400).json({ error: 'Unsupported URL scheme.' });
      return;
    }

    const hasDesktopGui =
      !process.env.K_SERVICE &&
      (process.platform === 'win32' ||
        process.platform === 'darwin' ||
        Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY));

    if (!hasDesktopGui) {
      res.json({ ok: true, launchedLocal: false, url: webUrl || candidate });
      return;
    }

    try {
      if (process.platform === 'darwin') {
        execFile('open', [candidate], () => {});
      } else if (process.platform === 'win32') {
        execFile('cmd', ['/c', 'start', '', candidate], () => {});
      } else {
        execFile('xdg-open', [candidate], () => {});
      }
      res.json({ ok: true, launchedLocal: true, url: candidate });
    } catch {
      res.json({ ok: true, launchedLocal: false, url: webUrl || candidate });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        fallback: true,
        error: 'Gemini API key is not configured for server-side chat.',
      });
      return;
    }

    const {
      prompt,
      assistantName,
      callOwnerAs,
      languageMode,
      mood,
      customInstructions,
      recentTurns,
      stream,
      useSearchGrounding,
    } = req.body as {
      prompt?: string;
      assistantName?: string;
      callOwnerAs?: string;
      languageMode?: string;
      mood?: string;
      customInstructions?: string;
      recentTurns?: Array<{ role: string; text: string }>;
      stream?: boolean;
      useSearchGrounding?: boolean;
    };

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    const cleanTurns = filterRecentConversationTurns(recentTurns, 4);
    const trimmedPrompt = prompt.trim();
    const structuredContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const turn of cleanTurns) {
      const geminiRole: 'user' | 'model' = turn.role === 'user' ? 'user' : 'model';
      const last = structuredContents[structuredContents.length - 1];
      if (last && last.role === geminiRole) {
        last.parts[0].text = `${last.parts[0].text}\n${turn.text}`;
      } else {
        structuredContents.push({ role: geminiRole, parts: [{ text: turn.text }] });
      }
    }
    // Always end with the current active user query as a dedicated user turn
    const lastTurn = structuredContents[structuredContents.length - 1];
    if (lastTurn && lastTurn.role === 'user') {
      if (lastTurn.parts[0].text.toLowerCase() === trimmedPrompt.toLowerCase()) {
        lastTurn.parts[0].text = trimmedPrompt;
      } else {
        lastTurn.parts[0].text = `${lastTurn.parts[0].text}\n\n${trimmedPrompt}`;
      }
    } else {
      structuredContents.push({ role: 'user', parts: [{ text: trimmedPrompt }] });
    }
    const fullInput = structuredContents;

    const systemInstruction = buildPersonaInstruction({
      assistantName,
      callOwnerAs,
      languageMode,
      mood,
      customInstructions,
    });

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const clientAbort = new AbortController();
      let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
      const stopKeepAlive = () => {
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
      };

      res.on('close', () => {
        stopKeepAlive();
        if (!res.writableEnded) {
          clientAbort.abort();
        }
      });

      keepAliveTimer = setInterval(() => {
        if (!clientAbort.signal.aborted && !res.writableEnded) {
          res.write('data: {"keepAlive":true}\n\n');
        }
      }, 1500);

      const streamAbort = new AbortController();
      const onClientAbort = () => streamAbort.abort();
      clientAbort.signal.addEventListener('abort', onClientAbort, { once: true });

      let firstChunkReceived = false;
      let ttftReject: ((reason?: unknown) => void) | null = null;
      const ttftTimeoutPromise = new Promise<never>((_, reject) => {
        ttftReject = reject;
      });
      ttftTimeoutPromise.catch(() => {});
      const wantGrounding = Boolean(useSearchGrounding) && Date.now() >= searchGroundingCooldownUntil;
      const ttftTimer = setTimeout(() => {
        if (!firstChunkReceived) {
          streamAbort.abort();
          ttftReject?.(new Error('TTFT timeout'));
        }
      }, wantGrounding ? 3600 : 2800);

      let fullReply = '';
      let streamHadError = false;
      try {
        const responseStream = await Promise.race([
          ai.models.generateContentStream({
            model: 'gemini-3.1-flash-lite',
            contents: fullInput,
            config: {
              systemInstruction,
              ...(wantGrounding ? { tools: [{ googleSearch: {} }] } : {}),
              maxOutputTokens: 260,
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.MINIMAL,
              },
              abortSignal: streamAbort.signal,
            },
          }),
          ttftTimeoutPromise,
        ]);

        for await (const chunk of responseStream) {
          if (clientAbort.signal.aborted) break;
          const delta = chunk.text ?? '';
          if (delta) {
            if (!firstChunkReceived) {
              firstChunkReceived = true;
              clearTimeout(ttftTimer);
            }
            fullReply += delta;
            res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
          }
        }
        clearTimeout(ttftTimer);

        if (!clientAbort.signal.aborted && fullReply.trim()) {
          stopKeepAlive();
          res.write(`data: ${JSON.stringify({ done: true, reply: fullReply.trim() })}\n\n`);
          res.end();
          return;
        }
      } catch (streamErr) {
        clearTimeout(ttftTimer);
        streamHadError = true;
        if (wantGrounding) {
          const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
          if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
            searchGroundingCooldownUntil = Date.now() + 15 * 60_000;
          }
        }
      }

      // Fast fallback if primary stream stalled or errored (without search tool if grounding failed)
      if (!clientAbort.signal.aborted && (!fullReply.trim() || streamHadError)) {
        const fallbackAbort = new AbortController();
        const fbTimer = setTimeout(() => fallbackAbort.abort(), 7000);
        const onAbort = () => fallbackAbort.abort();
        clientAbort.signal.addEventListener('abort', onAbort, { once: true });

        const runOne = async (model: string, thinkingLevel: ThinkingLevel): Promise<string> => {
          try {
            const out = await ai.models.generateContent({
              model,
              contents: fullInput,
              config: {
                systemInstruction,
                maxOutputTokens: 260,
                thinkingConfig: { thinkingLevel },
                abortSignal: fallbackAbort.signal,
              },
            });
            const text = out.text?.trim();
            if (!text) throw new Error('Empty fallback reply');
            return text;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (model === 'gemini-4-hydrogen' && (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED'))) {
              hydrogenQuotaCooldownUntil = Date.now() + 15 * 60_000;
            }
            throw err;
          }
        };

        try {
          const candidates: Array<Promise<string>> = [
            runOne('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL),
          ];
          if (Date.now() >= hydrogenQuotaCooldownUntil) {
            candidates.push(runOne('gemini-4-hydrogen', ThinkingLevel.LOW));
          }
          const fbReply = await Promise.any(candidates);
          clearTimeout(fbTimer);
          fallbackAbort.abort();
          if (fbReply && !clientAbort.signal.aborted) {
            stopKeepAlive();
            res.write(`data: ${JSON.stringify({ chunk: fbReply })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true, reply: fbReply })}\n\n`);
            res.end();
            return;
          }
        } catch (fbErr) {
          clearTimeout(fbTimer);
          if (!clientAbort.signal.aborted) {
            const firstInner =
              fbErr instanceof AggregateError && fbErr.errors?.length ? fbErr.errors[0] : fbErr;
            const message =
              firstInner instanceof Error ? firstInner.message : 'Unable to generate reply.';
            res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
          }
        }
      } else if (!clientAbort.signal.aborted && fullReply.trim() && !streamHadError) {
        res.write(`data: ${JSON.stringify({ done: true, reply: fullReply.trim() })}\n\n`);
      }
      stopKeepAlive();
      res.end();
      return;
    }

    if (Date.now() >= hydrogenQuotaCooldownUntil) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: fullInput,
          config: {
            systemInstruction,
            maxOutputTokens: 260,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.LOW,
            },
            abortSignal: AbortSignal.timeout(6000),
          },
        });
        const reply = response.text?.trim();
        if (reply) {
          res.json({ reply });
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          hydrogenQuotaCooldownUntil = Date.now() + 15 * 60_000;
        }
      }
    }

    try {
      const fallbackRes = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: fullInput,
        config: {
          systemInstruction,
          maxOutputTokens: 260,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
          abortSignal: AbortSignal.timeout(5500),
        },
      });
      const reply = fallbackRes.text?.trim();
      if (reply) {
        res.json({ reply });
        return;
      }
    } catch {
      // Fall through to 502 below
    }

    res.status(502).json({ fallback: true, error: 'Unable to generate response right now.' });
  });

  // Streaming natural human voice TTS via gemini-3.8-flash-lite-tts (raw 24kHz mono 16-bit LE PCM)
  app.post('/api/tts', async (req, res) => {
    const ai = getGeminiTtsClient();
    if (!ai) {
      res.status(200).json({ fallback: true, quotaExceeded: true, error: 'Gemini API key unavailable for neural TTS.' });
      return;
    }

    if (Date.now() < ttsQuotaCooldownUntil) {
      res.status(200).json({ fallback: true, quotaExceeded: true, error: 'Neural TTS quota cooldown active.' });
      return;
    }

    const { text, voiceName, mood } = req.body as {
      text?: string;
      voiceName?: string;
      mood?: string;
    };

    const cleanedText = (text ?? '').replace(/[*_`#]/g, '').trim();
    if (!cleanedText) {
      res.status(400).json({ error: 'Text is required for TTS.' });
      return;
    }

    const allowedVoices = new Set(['Zephyr', 'Kore', 'Puck', 'Charon']);
    const chosenVoice = voiceName && allowedVoices.has(voiceName) ? voiceName : 'Zephyr';

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanedText,
                speechMetadata: {
                  style: buildVoiceStyle(mood),
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: chosenVoice },
            },
          },
          abortSignal: abortController.signal,
        },
      });

      let wroteAudio = false;
      for await (const chunk of responseStream) {
        if (abortController.signal.aborted) break;
        const b64 = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (b64) {
          if (!wroteAudio) {
            wroteAudio = true;
            res.setHeader('Content-Type', 'audio/l16;rate=24000;channels=1');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
          }
          res.write(Buffer.from(b64, 'base64'));
        }
      }
      if (!wroteAudio && !res.headersSent) {
        res.status(200).json({ fallback: true, error: 'No audio frames returned.' });
        return;
      }
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to synthesize human voice.';
      const isQuota =
        message.includes('429') ||
        message.includes('RESOURCE_EXHAUSTED') ||
        message.toLowerCase().includes('quota');
      if (isQuota) {
        ttsQuotaCooldownUntil = Date.now() + 15 * 60_000;
      }
      if (!res.headersSent) {
        res.status(200).json({ fallback: true, quotaExceeded: isQuota, error: message });
      } else {
        res.end();
      }
    }
  });

  const server = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server },
        hmr: process.env.DISABLE_HMR === 'true' ? false : true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Real-time Gemini Live API bridge on /api/live (without aborting other upgrade paths like Vite HMR)
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
    if (pathname === '/api/live') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          error: 'Live voice requires GEMINI_API_KEY in server secrets. Falling back to local voice.',
        })
      );
      clientWs.close();
      return;
    }

    const url = new URL(req.url || '/api/live', `http://${req.headers.host || 'localhost'}`);
    const assistantName = url.searchParams.get('assistantName') || 'JARVIS';
    const callOwnerAs = url.searchParams.get('callOwnerAs') || 'Sir';
    const languageMode = url.searchParams.get('languageMode') || 'hinglish';
    const mood = url.searchParams.get('mood') || 'warm';
    const requestedVoice = url.searchParams.get('voiceName') || 'Zephyr';
    const customInstructions = url.searchParams.get('customInstructions') || '';
    const allowedVoices = new Set(['Zephyr', 'Kore', 'Puck', 'Charon']);
    const liveVoiceName = allowedVoices.has(requestedVoice) ? requestedVoice : 'Zephyr';

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let closed = false;

    try {
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: liveVoiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: buildPersonaInstruction({
            assistantName,
            callOwnerAs,
            languageMode,
            mood,
            customInstructions,
          }),
        },
        callbacks: {
          onopen: () => {
            if (!closed && clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ ready: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (closed || clientWs.readyState !== clientWs.OPEN) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(JSON.stringify({ outputTranscript: content.outputTranscription.text }));
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: () => {
            if (!closed && clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ error: 'Live voice session encountered a connection error.' }));
            }
          },
          onclose: () => {
            if (!closed && clientWs.readyState === clientWs.OPEN) {
              clientWs.close();
            }
          },
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to start Gemini Live voice session.';
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ error: msg }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession || closed) return;
      try {
        const parsed = JSON.parse(raw.toString()) as { audio?: string; text?: string };
        if (parsed.audio) {
          liveSession.sendRealtimeInput({
            audio: {
              data: parsed.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (parsed.text) {
          liveSession.sendRealtimeInput({ text: parsed.text });
        }
      } catch {
        // Ignore malformed packets
      }
    });

    clientWs.on('close', () => {
      closed = true;
      try {
        liveSession?.close();
      } catch {
        // ignore
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`JARVIS server listening on http://localhost:${PORT}`);
  });
}

void startServer();
