// Cooking-timer model (SPEC.md §5.21): reducer, remaining time, ordering,
// persistence (de)serialization, formatting and bar visibility. Pure — imports
// only from utils/i18n. The reducer receives ids and `now` (epoch ms) inside
// actions so it stays deterministic. Dates are ISO 8601 strings.
import { pluralPl, type Translator } from './i18n';
import type { TranslationKey } from '../i18n/dictionary';

export type TimerState = 'running' | 'paused' | 'done';

export type Timer = {
  id: string;
  recipeId: number;
  /** Links the timer to the chip that started it (see utils/timerMarkdown). */
  sourceKey: string;
  /** Recipe title at start time; the label is formatted at render time. */
  title: string;
  step: number | null;
  durationSec: number;
  state: TimerState;
  /** ISO end time — running only. */
  endsAt?: string;
  /** Seconds left — paused only. */
  remainingSec?: number;
};

export type TimerAction =
  | {
      type: 'start';
      id: string;
      recipeId: number;
      sourceKey: string;
      title: string;
      step: number | null;
      durationSec: number;
      now: number;
    }
  | { type: 'pause' | 'resume' | 'addMinute'; id: string; now: number }
  | { type: 'stop'; id: string }
  | { type: 'stopForRecipe'; recipeId: number }
  | { type: 'stopAll' }
  | { type: 'tick'; now: number };

const iso = (ms: number) => new Date(ms).toISOString();

function base(t: Timer) {
  return {
    id: t.id,
    recipeId: t.recipeId,
    sourceKey: t.sourceKey,
    title: t.title,
    step: t.step,
    durationSec: t.durationSec,
  };
}

function asRunning(t: Timer, endsAtMs: number): Timer {
  return { ...base(t), state: 'running', endsAt: iso(endsAtMs) };
}

function asPaused(t: Timer, remainingSec: number): Timer {
  return { ...base(t), state: 'paused', remainingSec };
}

function asDone(t: Timer): Timer {
  return { ...base(t), state: 'done' };
}

/** Whole seconds left (rounded up); 0 for done or past-due timers. */
export function remainingSeconds(timer: Timer, nowMs: number): number {
  if (timer.state === 'paused') return Math.max(0, timer.remainingSec ?? 0);
  if (timer.state === 'done' || !timer.endsAt) return 0;
  const left = Date.parse(timer.endsAt) - nowMs;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Replaces the timer with `id` via `fn`; same array when `fn` keeps it. */
function updateById(
  timers: Timer[],
  id: string,
  fn: (t: Timer) => Timer
): Timer[] {
  let changed = false;
  const next = timers.map((t) => {
    if (t.id !== id) return t;
    const updated = fn(t);
    if (updated !== t) changed = true;
    return updated;
  });
  return changed ? next : timers;
}

/** Marks running timers past their end as done, listing the newly expired. */
export function expireDue(
  timers: Timer[],
  nowMs: number
): { timers: Timer[]; expiredIds: string[] } {
  const expiredIds: string[] = [];
  const next = timers.map((t) => {
    if (t.state !== 'running' || !t.endsAt) return t;
    if (Date.parse(t.endsAt) > nowMs) return t;
    expiredIds.push(t.id);
    return asDone(t);
  });
  return { timers: expiredIds.length ? next : timers, expiredIds };
}

export function timersReducer(timers: Timer[], action: TimerAction): Timer[] {
  switch (action.type) {
    case 'start': {
      const existing = findTimerForChip(timers, action.recipeId, action.sourceKey);
      if (existing && existing.state !== 'done') return timers;
      const fresh: Timer = {
        id: action.id,
        recipeId: action.recipeId,
        sourceKey: action.sourceKey,
        title: action.title,
        step: action.step,
        durationSec: action.durationSec,
        state: 'running',
        endsAt: iso(action.now + action.durationSec * 1000),
      };
      const rest = existing ? timers.filter((t) => t !== existing) : timers;
      return [...rest, fresh];
    }
    case 'pause':
      return updateById(timers, action.id, (t) =>
        t.state === 'running' ? asPaused(t, remainingSeconds(t, action.now)) : t
      );
    case 'resume':
      return updateById(timers, action.id, (t) =>
        t.state === 'paused'
          ? asRunning(t, action.now + (t.remainingSec ?? 0) * 1000)
          : t
      );
    case 'addMinute':
      return updateById(timers, action.id, (t) => {
        if (t.state === 'running' && t.endsAt) {
          return asRunning(t, Date.parse(t.endsAt) + 60_000);
        }
        if (t.state === 'paused') return asPaused(t, (t.remainingSec ?? 0) + 60);
        // Done: restart for one minute.
        return asRunning(t, action.now + 60_000);
      });
    case 'stop': {
      const next = timers.filter((t) => t.id !== action.id);
      return next.length === timers.length ? timers : next;
    }
    case 'stopForRecipe': {
      const next = timers.filter((t) => t.recipeId !== action.recipeId);
      return next.length === timers.length ? timers : next;
    }
    case 'stopAll':
      return timers.length ? [] : timers;
    case 'tick':
      return expireDue(timers, action.now).timers;
    default:
      return timers;
  }
}

const STATE_RANK: Record<TimerState, number> = { done: 0, running: 1, paused: 2 };

/** Done first, then running by soonest end, then paused by least remaining. */
export function orderTimers(timers: Timer[], nowMs: number): Timer[] {
  return timers
    .map((t, i) => ({ t, i, left: remainingSeconds(t, nowMs) }))
    .sort((a, b) => {
      const rank = STATE_RANK[a.t.state] - STATE_RANK[b.t.state];
      if (rank !== 0) return rank;
      if (a.t.state === 'running' && a.t.endsAt && b.t.endsAt) {
        const diff = Date.parse(a.t.endsAt) - Date.parse(b.t.endsAt);
        if (diff !== 0) return diff;
      } else if (a.t.state === 'paused') {
        const diff = a.left - b.left;
        if (diff !== 0) return diff;
      }
      return a.i - b.i;
    })
    .map((x) => x.t);
}

/** The timer the collapsed bar shows, plus how many others are hidden. */
export function barSummary(
  timers: Timer[],
  nowMs: number
): { primary: Timer | null; othersCount: number } {
  if (timers.length === 0) return { primary: null, othersCount: 0 };
  return { primary: orderTimers(timers, nowMs)[0], othersCount: timers.length - 1 };
}

export function findTimerForChip(
  timers: Timer[],
  recipeId: number,
  sourceKey: string
): Timer | undefined {
  return timers.find((t) => t.recipeId === recipeId && t.sourceKey === sourceKey);
}

export function serializeTimers(timers: Timer[]): string {
  return JSON.stringify(timers.map((t) => {
    if (t.state === 'running') return { ...base(t), state: t.state, endsAt: t.endsAt };
    if (t.state === 'paused') {
      return { ...base(t), state: t.state, remainingSec: t.remainingSec };
    }
    return { ...base(t), state: t.state };
  }));
}

function parseOne(raw: unknown, nowMs: number): Timer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id === '') return null;
  if (typeof o.recipeId !== 'number' || !Number.isFinite(o.recipeId)) return null;
  if (typeof o.sourceKey !== 'string') return null;
  if (typeof o.title !== 'string') return null;
  if (o.step !== null && (typeof o.step !== 'number' || !Number.isFinite(o.step))) {
    return null;
  }
  if (typeof o.durationSec !== 'number' || !(o.durationSec > 0)) return null;
  const t: Timer = {
    id: o.id,
    recipeId: o.recipeId,
    sourceKey: o.sourceKey,
    title: o.title,
    step: o.step as number | null,
    durationSec: o.durationSec,
    state: 'done',
  };
  switch (o.state) {
    case 'running': {
      if (typeof o.endsAt !== 'string') return null;
      const end = Date.parse(o.endsAt);
      if (!Number.isFinite(end)) return null;
      // Ended while the app was gone — done, silently (no alarm at load).
      return end <= nowMs ? asDone(t) : { ...t, state: 'running', endsAt: o.endsAt };
    }
    case 'paused':
      if (
        typeof o.remainingSec !== 'number' ||
        !Number.isFinite(o.remainingSec) ||
        o.remainingSec < 0
      ) {
        return null;
      }
      return { ...t, state: 'paused', remainingSec: o.remainingSec };
    case 'done':
      return t;
    default:
      return null;
  }
}

/** Parses app_settings.active_timers, dropping anything malformed. */
export function parseStoredTimers(raw: string | null, nowMs: number): Timer[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: Timer[] = [];
  for (const item of data) {
    const t = parseOne(item, nowMs);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "mm:ss" under an hour, "h:mm:ss" from an hour up. */
export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

const UNIT_KEYS: Record<'hour' | 'minute' | 'second', Record<ReturnType<typeof pluralPl>, TranslationKey>> = {
  hour: { one: 'timer.unit.hour.one', few: 'timer.unit.hour.few', many: 'timer.unit.hour.many' },
  minute: {
    one: 'timer.unit.minute.one',
    few: 'timer.unit.minute.few',
    many: 'timer.unit.minute.many',
  },
  second: {
    one: 'timer.unit.second.one',
    few: 'timer.unit.second.few',
    many: 'timer.unit.second.many',
  },
};

/** Spoken duration for accessibility labels: "1 hour 30 minutes". */
export function formatDurationWords(totalSec: number, t: Translator): string {
  const s = Math.max(0, Math.round(totalSec));
  const parts: [keyof typeof UNIT_KEYS, number][] = [
    ['hour', Math.floor(s / 3600)],
    ['minute', Math.floor((s % 3600) / 60)],
    ['second', s % 60],
  ];
  const words = parts
    .filter(([, n]) => n > 0)
    .map(([unit, n]) => t(UNIT_KEYS[unit][pluralPl(n)], { count: n }));
  return words.length ? words.join(' ') : t(UNIT_KEYS.second.many, { count: 0 });
}

/** "Bread · step 3", or just the title when the duration has no step. */
export function timerLabel(t: Translator, title: string, step: number | null): string {
  return step == null ? title : t('timer.stepLabel', { title, step });
}

/** Modal routes where the bar would sit over a form. */
const HIDDEN_ROUTES = new Set([
  '/recipe/new',
  '/recipe/edit',
  '/recipe/add-to-list',
  '/shopping/new',
  '/cookbook/new',
  '/cookbook/edit',
]);

export function shouldShowTimerBar(o: {
  pathname: string;
  keyboardVisible: boolean;
  timerCount: number;
}): boolean {
  if (o.timerCount <= 0 || o.keyboardVisible) return false;
  return !HIDDEN_ROUTES.has(o.pathname);
}
