import React, { useState } from 'react';
import { Bell, Check, Play, Plus, Trash2 } from 'lucide-react';
import { formatTime12h, sortTasks } from '../engine/routines';
import type { RoutineItem, SmartScene, TaskCategory, TaskItem } from '../types/assistant';

interface TasksAndRoutinesViewProps {
  tasks: TaskItem[];
  routines: RoutineItem[];
  scenes: SmartScene[];
  onAddTask: (title: string, dueTime: string, category: TaskCategory, priority: 'normal' | 'high') => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onClearCompleted: () => void;
  onAddRoutine: (title: string, time: string, reminderMessage: string, sceneId?: string) => void;
  onToggleRoutine: (id: string) => void;
  onTriggerRoutine: (routine: RoutineItem) => void;
  onDeleteRoutine: (id: string) => void;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const TasksAndRoutinesView: React.FC<TasksAndRoutinesViewProps> = ({
  tasks,
  routines,
  scenes,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onClearCompleted,
  onAddRoutine,
  onToggleRoutine,
  onTriggerRoutine,
  onDeleteRoutine,
}) => {
  const [filter, setFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('Personal');
  const [taskPriority, setTaskPriority] = useState<'normal' | 'high'>('normal');
  const [taskError, setTaskError] = useState('');

  const [routineTitle, setRoutineTitle] = useState('');
  const [routineTime, setRoutineTime] = useState('09:00');
  const [routineMsg, setRoutineMsg] = useState('');
  const [routineScene, setRoutineScene] = useState('');
  const [routineError, setRoutineError] = useState('');

  const sortedTasks = sortTasks(tasks);
  const filteredTasks = sortedTasks.filter((t) => {
    if (filter === 'open') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });
  const completedCount = tasks.filter((t) => t.completed).length;

  const handleTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) {
      setTaskError('Please enter a task or reminder title.');
      return;
    }
    setTaskError('');
    onAddTask(taskTitle.trim(), taskTime, taskCategory, taskPriority);
    setTaskTitle('');
    setTaskTime('');
    setTaskPriority('normal');
  };

  const handleRoutineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!routineTitle.trim() || !routineMsg.trim()) {
      setRoutineError('Enter both a routine name and a personal spoken reminder message.');
      return;
    }
    setRoutineError('');
    onAddRoutine(routineTitle.trim(), routineTime || '09:00', routineMsg.trim(), routineScene || undefined);
    setRoutineTitle('');
    setRoutineMsg('');
    setRoutineScene('');
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Daily Tasks Column */}
      <section
        aria-label="Daily tasks and reminders"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-7 dark:border-slate-800 dark:bg-[#131922]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Daily Tasks & Reminders
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {tasks.filter((t) => !t.completed).length} open · {completedCount} completed
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
              {(['all', 'open', 'completed'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                    filter === key
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
            {completedCount > 0 && (
              <button
                type="button"
                onClick={onClearCompleted}
                className="min-h-[36px] rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 whitespace-nowrap shrink-0"
              >
                Clear Done
              </button>
            )}
          </div>
        </div>

        {/* Add Task Form */}
        <form onSubmit={handleTaskSubmit} className="mt-4 space-y-2.5 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="new-task-title" className="sr-only">
              Task title
            </label>
            <input
              id="new-task-title"
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Add a task or reminder..."
              className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
            <label htmlFor="new-task-time" className="sr-only">
              Due time
            </label>
            <input
              id="new-task-time"
              type="time"
              value={taskTime}
              onChange={(e) => setTaskTime(e.target.value)}
              className="min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor="new-task-category" className="sr-only">
                Category
              </label>
              <select
                id="new-task-category"
                value={taskCategory}
                onChange={(e) => setTaskCategory(e.target.value as TaskCategory)}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="Personal">Personal</option>
                <option value="Focus">Focus</option>
                <option value="Health">Health</option>
                <option value="Home">Home</option>
              </select>
              <button
                type="button"
                onClick={() => setTaskPriority((p) => (p === 'normal' ? 'high' : 'normal'))}
                aria-pressed={taskPriority === 'high'}
                className={`min-h-[40px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  taskPriority === 'high'
                    ? 'border-amber-600 bg-amber-50 text-amber-800 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {taskPriority === 'high' ? 'High Priority' : 'Normal Priority'}
              </button>
            </div>
            <button
              type="submit"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 sm:w-auto dark:bg-blue-600 dark:hover:bg-blue-500 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add Task</span>
            </button>
          </div>
          {taskError && <p className="text-xs text-red-600 dark:text-red-400">{taskError}</p>}
        </form>

        {/* Task List */}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {filteredTasks.length === 0 ? (
            <li className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No tasks in this view. Speak or type a reminder to add one.
            </li>
          ) : (
            filteredTasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onToggleTask(task.id)}
                    aria-label={task.completed ? `Mark '${task.title}' open` : `Complete '${task.title}'`}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      task.completed
                        ? 'text-teal-700 dark:text-teal-400'
                        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        task.completed
                          ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-500'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {task.completed && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    </span>
                  </button>
                  <div className="min-w-0">
                    <p
                      className={`truncate text-sm font-medium ${
                        task.completed
                          ? 'text-slate-400 line-through dark:text-slate-500'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {task.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{task.category}</span>
                      {task.dueTime && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">{formatTime12h(task.dueTime)}</span>
                        </>
                      )}
                      {task.priority === 'high' && !task.completed && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            High priority
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteTask(task.id)}
                  aria-label={`Delete '${task.title}'`}
                  className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Personalized Routine Reminders Column */}
      <section
        aria-label="Personalized routine reminders"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-5 dark:border-slate-800 dark:bg-[#131922]"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Personalized Routines
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Local spoken check-ins and smart-home triggers
            </p>
          </div>
          <Bell className="h-5 w-5 text-slate-400" aria-hidden="true" />
        </div>

        <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800/80">
          {routines.map((routine) => {
            const linkedScene = scenes.find((s) => s.id === routine.sceneId);
            return (
              <li key={routine.id} className="py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tabular text-sm font-semibold text-blue-700 dark:text-blue-400">
                        {formatTime12h(routine.time)}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">
                        ·
                      </span>
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {routine.title}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {routine.reminderMessage}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        {routine.days.length === 7
                          ? 'Every day'
                          : routine.days.map((d) => DAY_LABELS[d]).join(' ')}
                      </span>
                      {linkedScene && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Scene: {linkedScene.name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onTriggerRoutine(routine)}
                      aria-label={`Run '${routine.title}' now`}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={routine.enabled}
                      aria-label={`Toggle '${routine.title}' routine`}
                      onClick={() => onToggleRoutine(routine.id)}
                      className={`inline-flex min-h-[36px] items-center rounded-lg px-2.5 text-xs font-medium transition-colors ${
                        routine.enabled
                          ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {routine.enabled ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRoutine(routine.id)}
                      aria-label={`Delete '${routine.title}' routine`}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Add Custom Routine */}
        <form onSubmit={handleRoutineSubmit} className="mt-4 space-y-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Create Routine Reminder
          </p>
          <div className="flex gap-2">
            <label htmlFor="routine-title-input" className="sr-only">
              Routine name
            </label>
            <input
              id="routine-title-input"
              type="text"
              value={routineTitle}
              onChange={(e) => setRoutineTitle(e.target.value)}
              placeholder="Routine name (e.g. Afternoon Walk)"
              className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
            <label htmlFor="routine-time-input" className="sr-only">
              Routine time
            </label>
            <input
              id="routine-time-input"
              type="time"
              value={routineTime}
              onChange={(e) => setRoutineTime(e.target.value)}
              className="min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <label htmlFor="routine-message-input" className="sr-only">
            Spoken reminder message
          </label>
          <input
            id="routine-message-input"
            type="text"
            value={routineMsg}
            onChange={(e) => setRoutineMsg(e.target.value)}
            placeholder="Personal spoken reminder..."
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
          />
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="routine-scene-select" className="sr-only">
              Linked smart home scene
            </label>
            <select
              id="routine-scene-select"
              value={routineScene}
              onChange={(e) => setRoutineScene(e.target.value)}
              className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">No linked smart home scene</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  Scene: {s.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 whitespace-nowrap shrink-0"
            >
              Save Routine
            </button>
          </div>
          {routineError && <p className="text-xs text-red-600 dark:text-red-400">{routineError}</p>}
        </form>
      </section>
    </div>
  );
};
