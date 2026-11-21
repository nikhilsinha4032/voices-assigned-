export interface BrainChatRequest {
  prompt: string;
  assistantName: string;
  callOwnerAs: string;
  languageMode: string;
  mood: string;
  customInstructions: string;
  useSearchGrounding: boolean;
  recentTurns: Array<{ role: 'user' | 'assistant'; text: string }>;
}

export interface StreamBrainOptions {
  payload: BrainChatRequest;
  signal: AbortSignal;
  onDelta?: (partialText: string) => void;
  fetchFn?: typeof fetch;
  maxStreamAttempts?: number;
  keepAliveTimeoutMs?: number;
  retryDelayMs?: number;
  fallbackTimeoutMs?: number;
}

interface ParsedSseResult {
  reply: string;
  receivedDone: boolean;
  streamErrored: boolean;
}

function delayWithAbort(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (ms <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Executes a conversational brain request over SSE with:
 * - keep-alive inactivity watchdog (reset on chunks, keepAlive pings, or SSE comments)
 * - detection of unexpected stream drops before `{ done: true }`
 * - automatic SSE retry with brief backoff before falling back to non-streaming JSON
 * - preservation of external AbortSignal cancellation
 */
export async function streamChatWithRetry(
  options: StreamBrainOptions
): Promise<string | null> {
  const {
    payload,
    signal,
    onDelta,
    fetchFn = fetch,
    maxStreamAttempts = 2,
    keepAliveTimeoutMs = 5500,
    retryDelayMs = 220,
    fallbackTimeoutMs = 8000,
  } = options;

  let bestPartialReply = '';

  const runSingleSseAttempt = async (): Promise<ParsedSseResult> => {
    if (signal.aborted) {
      return { reply: '', receivedDone: false, streamErrored: true };
    }

    const attemptController = new AbortController();
    const onExternalAbort = () => attemptController.abort();
    signal.addEventListener('abort', onExternalAbort, { once: true });

    let watchdogId: ReturnType<typeof setTimeout> | undefined;
    const resetWatchdog = () => {
      if (watchdogId !== undefined) clearTimeout(watchdogId);
      watchdogId = setTimeout(() => attemptController.abort(), keepAliveTimeoutMs);
    };
    resetWatchdog();

    let accumulated = '';
    let receivedDone = false;
    let streamErrored = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const processFrames = (frames: string[]) => {
      for (const frame of frames) {
        const lines = frame.split(/\r?\n/);
        for (const rawLine of lines) {
          if (rawLine.startsWith(':')) {
            // SSE comment heartbeat confirms connection is still alive
            resetWatchdog();
            continue;
          }
          if (!rawLine.startsWith('data:')) continue;
          const jsonStr = rawLine.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const msg = JSON.parse(jsonStr) as {
              chunk?: string;
              done?: boolean;
              reply?: string;
              error?: string;
              keepAlive?: boolean;
            };
            if (msg.keepAlive) {
              resetWatchdog();
              continue;
            }
            if (msg.chunk) {
              accumulated += msg.chunk;
              if (accumulated.trim().length > bestPartialReply.length) {
                bestPartialReply = accumulated.trim();
              }
              onDelta?.(accumulated);
            } else if (msg.done) {
              receivedDone = true;
              if (msg.reply) {
                accumulated = msg.reply;
              }
            } else if (msg.error) {
              streamErrored = true;
            }
          } catch {
            // Ignore malformed SSE payload lines
          }
        }
      }
    };

    try {
      const res = await fetchFn('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: attemptController.signal,
        body: JSON.stringify({ ...payload, stream: true }),
      });

      if (!res.ok) {
        return { reply: '', receivedDone: false, streamErrored: true };
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream') || !res.body) {
        const data = (await res.json()) as { reply?: string };
        const directReply = data.reply?.trim() || '';
        return {
          reply: directReply,
          receivedDone: Boolean(directReply),
          streamErrored: !directReply,
        };
      }

      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        resetWatchdog();

        sseBuffer += decoder.decode(value, { stream: true });
        const frames = sseBuffer.split(/\r?\n\r?\n/);
        sseBuffer = frames.pop() ?? '';
        processFrames(frames);

        if (streamErrored || receivedDone) {
          break;
        }
      }

      sseBuffer += decoder.decode();
      if (sseBuffer.trim()) {
        processFrames(sseBuffer.split(/\r?\n\r?\n/));
      }

      return {
        reply: accumulated.trim(),
        receivedDone,
        streamErrored,
      };
    } catch {
      return {
        reply: accumulated.trim(),
        receivedDone: false,
        streamErrored: true,
      };
    } finally {
      if (watchdogId !== undefined) clearTimeout(watchdogId);
      signal.removeEventListener('abort', onExternalAbort);
      try {
        await reader?.cancel();
      } catch {
        // Ignore stream cancel errors
      }
    }
  };

  const fetchNonStreamFallback = async (): Promise<string | null> => {
    if (signal.aborted) return null;
    const fbController = new AbortController();
    const fbTimer = setTimeout(() => fbController.abort(), fallbackTimeoutMs);
    const onExternalAbort = () => fbController.abort();
    signal.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const fallbackRes = await fetchFn('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: fbController.signal,
        body: JSON.stringify({ ...payload, stream: false }),
      });
      if (!fallbackRes.ok) return null;
      const data = (await fallbackRes.json()) as { reply?: string };
      const clean = data.reply?.trim() || null;
      if (clean) {
        onDelta?.(clean);
      }
      return clean;
    } catch {
      return null;
    } finally {
      clearTimeout(fbTimer);
      signal.removeEventListener('abort', onExternalAbort);
    }
  };

  for (let attempt = 0; attempt < maxStreamAttempts; attempt++) {
    if (signal.aborted) return null;
    const result = await runSingleSseAttempt();

    if (result.receivedDone && !result.streamErrored && result.reply) {
      return result.reply;
    }

    // Stream dropped unexpectedly before receiving `{ done: true }`
    if (attempt + 1 < maxStreamAttempts && !signal.aborted) {
      const waited = await delayWithAbort(retryDelayMs, signal);
      if (!waited) return null;
    }
  }

  if (signal.aborted) return null;

  const fallbackReply = await fetchNonStreamFallback();
  if (fallbackReply) {
    return fallbackReply;
  }

  return bestPartialReply || null;
}
