import type { AssistantState, RoutineItem, TaskItem } from '../types/assistant';

export function formatTime12h(time24?: string): string {
  if (!time24) return 'Anytime';
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function getTimeOfDayGreeting(hour: number, name: string): string {
  const cleanName = name.trim() || 'Alex';
  if (hour < 12) return `Good morning, ${cleanName}`;
  if (hour < 17) return `Good afternoon, ${cleanName}`;
  return `Good evening, ${cleanName}`;
}

export function getDueRoutines(routines: RoutineItem[], now: Date): RoutineItem[] {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hh}:${mm}`;
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const dayOfWeek = now.getDay();
  const nowMs = now.getTime();

  return routines.filter((r) => {
    if (!r.enabled) return false;
    if (!r.days.includes(dayOfWeek)) return false;
    if (r.lastTriggeredDate === todayDate) return false;
    if (r.snoozedUntil && nowMs < r.snoozedUntil) return false;
    return r.time === currentTime;
  });
}

export function getNextUpcomingRoutine(routines: RoutineItem[], now: Date): RoutineItem | null {
  const enabled = routines.filter((r) => r.enabled);
  if (enabled.length === 0) return null;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const withDelta = enabled.map((r) => {
    const [h, m] = r.time.split(':').map(Number);
    const mins = (h || 0) * 60 + (m || 0);
    const delta = mins >= currentMinutes ? mins - currentMinutes : mins + 1440 - currentMinutes;
    return { routine: r, delta };
  });

  withDelta.sort((a, b) => a.delta - b.delta);
  return withDelta[0]?.routine ?? null;
}

export function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
    if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
    if (a.dueTime) return -1;
    if (b.dueTime) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function getTodayDateKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

export function isValidAssistantState(candidate: unknown): candidate is AssistantState {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = candidate as Record<string, unknown>;
  return (
    Array.isArray(obj.tasks) &&
    Array.isArray(obj.routines) &&
    Array.isArray(obj.devices) &&
    Array.isArray(obj.scenes) &&
    typeof obj.emotionSettings === 'object' &&
    typeof obj.voiceSettings === 'object'
  );
}
