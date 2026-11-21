import type { AppLaunchIntent } from '../engine/appLauncher';

/**
 * Safely triggers an external app / browser tab without calling window.open
 * (which violates iframe sandbox rules and gets blocked by pop-up blockers).
 * Also attempts native OS launch when running on the owner's local laptop.
 */
export async function launchAppSafely(intent: AppLaunchIntent): Promise<void> {
  if (typeof document !== 'undefined') {
    try {
      const anchor = document.createElement('a');
      anchor.href = intent.webUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch {
      // Fallback UI card still provides a direct 1-tap clickable link
    }
  }

  try {
    await fetch('/api/open-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: intent.target,
        webUrl: intent.webUrl,
        appUri: intent.appUri,
      }),
    });
  } catch {
    // Cloud preview or offline mode relies on the web link / action card
  }
}
