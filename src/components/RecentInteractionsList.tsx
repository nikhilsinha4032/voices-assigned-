import React from 'react';
import { History, Volume2 } from 'lucide-react';
import { formatTime12h } from '../engine/routines';
import type { ConversationTurn } from '../types/assistant';

interface RecentInteractionsListProps {
  history: ConversationTurn[];
  assistantName: string;
  onReplayVoice: (text: string) => void;
}

export const RecentInteractionsList: React.FC<RecentInteractionsListProps> = ({
  history,
  assistantName,
  onReplayVoice,
}) => {
  const recentFive = history.slice(-5);

  return (
    <section
      aria-label="Recent voice interactions mini-history"
      data-testid="recent-interactions-list"
      className="rounded-2xl border border-sky-500/15 bg-[#081020] p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-white">
            Recent Interactions
          </h2>
        </div>
        <span className="font-mono-tabular text-xs text-slate-400">
          Last {recentFive.length} of 5
        </span>
      </div>

      {recentFive.length === 0 ? (
        <p className="border-t border-sky-500/10 pt-3 text-xs text-slate-400">
          Say "{assistantName}" or type below to start your conversation.
        </p>
      ) : (
        <ul className="divide-y divide-sky-500/10 border-t border-sky-500/10">
          {recentFive.map((turn) => {
            const isUser = turn.role === 'user';
            const d = new Date(turn.timestamp);
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return (
              <li
                key={turn.id}
                className="flex items-start justify-between gap-3 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className={isUser ? 'font-medium text-sky-300' : 'font-medium text-teal-300'}>
                      {isUser ? 'You' : assistantName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{formatTime12h(`${hh}:${mm}`)}</span>
                    {turn.actionsTaken && turn.actionsTaken.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate text-slate-400">
                          {turn.actionsTaken.join(', ')}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-100">
                    {turn.text}
                  </p>
                </div>

                {!isUser && (
                  <button
                    type="button"
                    onClick={() => onReplayVoice(turn.text)}
                    aria-label={`Replay ${assistantName} message`}
                    className="flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-sky-300"
                  >
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
