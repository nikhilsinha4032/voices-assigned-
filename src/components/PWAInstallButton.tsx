import React, { useState } from 'react';
import { Code2, Download, Laptop, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  onOpenCustomize?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  onOpenCustomize,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  // Suppress install prompt when already launched as an installed standalone app
  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        aria-label="Download or install assistant on laptop and mobile"
        className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-sky-200 transition-colors hover:bg-slate-800 hover:text-white whitespace-nowrap shrink-0"
      >
        <Download className="h-4 w-4 text-sky-400" aria-hidden="true" />
        <span>{compact ? 'Download' : 'Download / Install'}</span>
      </button>

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sky-500/25 bg-[#081020] p-5 text-slate-100 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-sky-500/15 pb-3">
              <div>
                <h3 id="pwa-install-title" className="font-display text-lg font-semibold text-white">
                  Download & Customize on Laptop
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Install as a standalone desktop app or download full editable code.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close download modal"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-slate-300">
              {/* Option 1: Install as Laptop / Mobile Standalone App */}
              <div className="rounded-xl border border-sky-500/20 bg-[#050A14] p-4">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <Laptop className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  <span>1. Install as Laptop App (One Window, Offline Ready)</span>
                </div>

                {isInstallable ? (
                  <button
                    type="button"
                    onClick={() => {
                      void install().then((accepted) => {
                        if (accepted) setShowModal(false);
                      });
                    }}
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span>Install App on This Laptop</span>
                  </button>
                ) : (
                  <div className="mt-2.5 space-y-2 text-xs text-slate-300">
                    <p className="font-medium text-sky-300">Windows / Mac / Linux (Chrome or Edge):</p>
                    <ol className="list-decimal space-y-1 pl-5">
                      <li>
                        Click the <strong>Install icon</strong> on the right side of the browser
                        address bar, or open <strong>Menu (⋮) → Cast, save, and share → Install
                        page as app</strong>.
                      </li>
                      <li>It opens in its own laptop desktop window without browser tabs.</li>
                    </ol>
                  </div>
                )}

                {isIOS && (
                  <div className="mt-3 border-t border-slate-800 pt-2.5 text-xs text-slate-300">
                    <p className="flex items-center gap-1.5 font-medium text-sky-300">
                      <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>iPhone / iPad (Safari)</span>
                    </p>
                    <p className="mt-1">Tap Share → Add to Home Screen for standalone access.</p>
                  </div>
                )}
              </div>

              {/* Option 2: Download Full Customizable Source Code */}
              <div className="rounded-xl border border-sky-500/20 bg-[#050A14] p-4">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <Code2 className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  <span>2. Download Full Source Code (.zip) to Customize</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  Download all React, Three.js hologram, voice, and server code to your laptop. Run{' '}
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sky-300">
                    npm install && npm run dev
                  </code>{' '}
                  locally anytime.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href="/api/download-source"
                    download="jarvis-personal-assistant.zip"
                    data-testid="download-source-zip-link"
                    className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 whitespace-nowrap"
                  >
                    <Download className="h-4 w-4 text-sky-400" aria-hidden="true" />
                    <span>Download Code (.zip)</span>
                  </a>
                  {onOpenCustomize && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        onOpenCustomize();
                      }}
                      className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                    >
                      Customize Personality Now
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="mt-5 flex min-h-[42px] w-full items-center justify-center rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
