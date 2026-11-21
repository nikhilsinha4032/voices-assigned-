import React from 'react';
import { ArrowRight, Check, Home, Play, Sun } from 'lucide-react';
import { formatTime12h, getNextUpcomingRoutine, sortTasks } from '../engine/routines';
import { getActiveDeviceCount } from '../engine/smarthome';
import type { RoutineItem, SmartDevice, SmartScene, TaskItem } from '../types/assistant';

interface TodayOverviewProps {
  tasks: TaskItem[];
  routines: RoutineItem[];
  devices: SmartDevice[];
  scenes: SmartScene[];
  onToggleTask: (id: string) => void;
  onTriggerRoutine: (routine: RoutineItem) => void;
  onActivateScene: (scene: SmartScene) => void;
  onUpdateDevice: (deviceId: string, patch: Partial<SmartDevice>) => void;
  onNavigate: (tab: 'tasks' | 'home' | 'settings') => void;
}

export const TodayOverview: React.FC<TodayOverviewProps> = ({
  tasks,
  routines,
  devices,
  scenes,
  onToggleTask,
  onTriggerRoutine,
  onActivateScene,
  onUpdateDevice,
  onNavigate,
}) => {
  const openTasks = sortTasks(tasks).filter((t) => !t.completed).slice(0, 4);
  const nextRoutine = getNextUpcomingRoutine(routines, new Date());
  const thermostat = devices.find((d) => d.type === 'thermostat');
  const frontLock = devices.find((d) => d.type === 'lock');
  const activeCount = getActiveDeviceCount(devices);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left 7 cols: Priority Tasks & Next Routine */}
      <div className="space-y-6 lg:col-span-7">
        <section
          aria-label="Today's open tasks"
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-[#131922]"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Today’s Priorities
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {tasks.filter((t) => !t.completed).length} open · {tasks.filter((t) => t.completed).length} completed
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 whitespace-nowrap shrink-0"
            >
              <span>All Tasks</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/80">
            {openTasks.length === 0 ? (
              <li className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                All tasks for today are complete.
              </li>
            ) : (
              openTasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      aria-label={`Complete '${task.title}'`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-300 dark:border-slate-600">
                        {task.completed && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      </span>
                    </button>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {task.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {task.category}
                        {task.dueTime ? ` · ${formatTime12h(task.dueTime)}` : ''}
                      </p>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        {nextRoutine && (
          <section
            aria-label="Next personalized routine"
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-[#131922]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-400">
                  <Sun className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Next Routine ·{' '}
                    <span className="font-mono-tabular">{formatTime12h(nextRoutine.time)}</span>
                  </p>
                  <h3 className="mt-0.5 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    {nextRoutine.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {nextRoutine.reminderMessage}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onTriggerRoutine(nextRoutine)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Run Now</span>
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Right 5 cols: Home Pulse & Quick Scenes */}
      <section
        aria-label="Smart home quick pulse"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-5 dark:border-slate-800 dark:bg-[#131922]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Home className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Home Environment
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {activeCount} of {devices.length} active on local bus
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 whitespace-nowrap shrink-0"
          >
            <span>All Devices</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Key Home Controls */}
        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {thermostat && (
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {thermostat.name}
                </p>
                <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                  Target {(thermostat.targetTemp ?? 21).toFixed(1)}°C
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(16, Number(((thermostat.targetTemp ?? 21) - 0.5).toFixed(1)));
                    onUpdateDevice(thermostat.id, { targetTemp: next, value: next, isOn: true });
                  }}
                  aria-label="Cool home by 0.5 degrees"
                  className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(28, Number(((thermostat.targetTemp ?? 21) + 0.5).toFixed(1)));
                    onUpdateDevice(thermostat.id, { targetTemp: next, value: next, isOn: true });
                  }}
                  aria-label="Warm home by 0.5 degrees"
                  className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {frontLock && (
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {frontLock.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {frontLock.locked ? 'Secured & Locked' : 'Unlocked'}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateDevice(frontLock.id, { locked: !frontLock.locked, isOn: true })
                }
                className={`min-h-[44px] rounded-xl px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  frontLock.locked
                    ? 'bg-teal-50 text-teal-800 hover:bg-teal-100 dark:bg-teal-950/50 dark:text-teal-300'
                    : 'bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300'
                }`}
              >
                {frontLock.locked ? 'Unlock' : 'Lock'}
              </button>
            </div>
          )}
        </div>

        {/* Quick Scenes */}
        <div className="mt-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Quick Scenes</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {scenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => onActivateScene(scene)}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-800 transition-colors hover:border-blue-600 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500"
              >
                {scene.name}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
