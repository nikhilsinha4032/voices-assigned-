import React from 'react';
import { Bell, Check, Clock } from 'lucide-react';
import { formatTime12h } from '../engine/routines';
import type { RoutineItem } from '../types/assistant';

interface DueRoutineBannerProps {
  routine: RoutineItem | null;
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string) => void;
}

export const DueRoutineBanner: React.FC<DueRoutineBannerProps> = ({
  routine,
  onAcknowledge,
  onSnooze,
}) => {
  if (!routine) return null;

  return (
    <div
      role="alert"
      className="rounded-2xl border border-blue-200 bg-blue-50/90 p-4 dark:border-blue-800/70 dark:bg-blue-950/50"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white dark:bg-blue-600">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-blue-800 dark:text-blue-300">
              Routine Reminder · <span className="font-mono-tabular">{formatTime12h(routine.time)}</span>
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {routine.title}
            </p>
            <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
              {routine.reminderMessage}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={() => onSnooze(routine.id)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Snooze 15m</span>
          </button>
          <button
            type="button"
            onClick={() => onAcknowledge(routine.id)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 whitespace-nowrap shrink-0"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
};
