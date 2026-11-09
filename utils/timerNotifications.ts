// Cooking timers, stage 2 (SPEC.md §5.21): background alarms as local OS
// notifications. Pure — imports only utils/i18n and utils/timers, never
// expo-notifications or react-native, so it runs under jest as-is. The native
// side (utils/timerAlarm.ts) reads the OS state, asks planTimerNotifications
// what to change, and executes the plan. The notifications ring until the user
// acts: modules/exactalarm posts them insistent with a Stop action.
import type { Translator } from './i18n';
import { timerLabel, type Timer } from './timers';

/** Android notification channel for timer alarms. */
export const TIMER_CHANNEL_ID = 'timers';
/** Every timer notification identifier starts with this; others are ignored. */
export const TIMER_NOTIFICATION_PREFIX = 'timer:';
/** Scheduled fire time may drift this much from `endsAt` before a reschedule. */
export const FIRE_TIME_TOLERANCE_MS = 1000;
/** With the OS alarm armed but inexact, the in-app alert plays only for expiries this fresh. */
export const LIVE_EXPIRY_WINDOW_MS = 5000;

export function timerNotificationId(timerId: string): string {
  return TIMER_NOTIFICATION_PREFIX + timerId;
}

/** The timer id behind a notification identifier, or null if it isn't ours. */
export function timerIdFromNotificationId(identifier: string): string | null {
  if (!identifier.startsWith(TIMER_NOTIFICATION_PREFIX)) return null;
  const id = identifier.slice(TIMER_NOTIFICATION_PREFIX.length);
  return id.length > 0 ? id : null;
}

export type TimerNotificationContent = {
  title: string;
  body: string;
  /**
   * `stopLabel` is the localized "Stop" action title — the native
   * TimerPresentationDelegate (modules/exactalarm) reads it from the data
   * body when it adds the action button to the ringing notification.
   */
  data: { recipeId: number; timerId: string; stopLabel: string };
};

/** Localized content: "Time's up" + the timer label ("Bread · step 3"). */
export function buildTimerNotificationContent(
  timer: Timer,
  t: Translator
): TimerNotificationContent {
  return {
    title: t('timer.done'),
    body: timerLabel(t, timer.title, timer.step),
    data: { recipeId: timer.recipeId, timerId: timer.id, stopLabel: t('timer.alarmStop') },
  };
}

/**
 * Fire time (epoch ms) of a scheduled request's trigger as the OS reports it.
 * Android DATE triggers come back as `{ type: 'date', value: <ms> }`; anything
 * else is unknown (null), which makes the planner reschedule.
 */
export function fireTimeFromTrigger(trigger: unknown): number | null {
  if (typeof trigger !== 'object' || trigger === null) return null;
  const { type, value } = trigger as { type?: unknown; value?: unknown };
  if (type !== 'date') return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A pending OS request, reduced to what the planner compares. */
export type ScheduledTimerNotification = {
  identifier: string;
  fireAtMs: number | null;
  title: string | null;
  body: string | null;
};

export type TimerNotificationRequest = {
  identifier: string;
  fireAtMs: number;
  timerId: string;
  recipeId: number;
  title: string;
  body: string;
};

export type TimerNotificationPlan = {
  /** Scheduled identifiers to cancel. */
  cancel: string[];
  /** Requests to (re)schedule — same identifier replaces the pending one. */
  schedule: TimerNotificationRequest[];
  /** Delivered (presented) identifiers to remove from the shade. */
  dismiss: string[];
};

/** Running with a parseable end time still in the future. */
function desiredFireTime(timer: Timer, nowMs: number): number | null {
  if (timer.state !== 'running' || !timer.endsAt) return null;
  const at = Date.parse(timer.endsAt);
  return Number.isFinite(at) && at > nowMs ? at : null;
}

/**
 * Reconciles the OS notification state with the timer list.
 * - schedule: running future timers with no matching pending request (missing,
 *   unknown or drifted fire time, or different title/body); every one of them
 *   when `rearm` (first sync of a process — a force-stop drops the OS alarms
 *   while the stored requests survive).
 * - cancel: pending timer requests whose timer is gone or paused. Never a
 *   running-but-due or done timer's (its alarm is firing / has fired).
 * - dismiss: delivered timer notifications whose timer is gone or no longer
 *   done (stopped, dismissed, or restarted with +1 min).
 * Identifiers without the timer prefix are ignored everywhere.
 */
export function planTimerNotifications(input: {
  timers: readonly Timer[];
  nowMs: number;
  t: Translator;
  scheduled: readonly ScheduledTimerNotification[];
  presented: readonly string[];
  rearm?: boolean;
}): TimerNotificationPlan {
  const { timers, nowMs, t, scheduled, presented, rearm = false } = input;
  const byId = new Map(timers.map((timer) => [timer.id, timer]));
  const scheduledById = new Map<string, ScheduledTimerNotification>();
  for (const entry of scheduled) {
    if (timerIdFromNotificationId(entry.identifier) !== null) {
      scheduledById.set(entry.identifier, entry);
    }
  }

  const schedule: TimerNotificationRequest[] = [];
  for (const timer of timers) {
    const fireAtMs = desiredFireTime(timer, nowMs);
    if (fireAtMs === null) continue;
    const identifier = timerNotificationId(timer.id);
    const { title, body } = buildTimerNotificationContent(timer, t);
    const existing = scheduledById.get(identifier);
    const matches =
      existing !== undefined &&
      existing.fireAtMs !== null &&
      Math.abs(existing.fireAtMs - fireAtMs) <= FIRE_TIME_TOLERANCE_MS &&
      existing.title === title &&
      existing.body === body;
    if (rearm || !matches) {
      schedule.push({ identifier, fireAtMs, timerId: timer.id, recipeId: timer.recipeId, title, body });
    }
  }

  const cancel: string[] = [];
  const seenCancel = new Set<string>();
  for (const entry of scheduled) {
    const timerId = timerIdFromNotificationId(entry.identifier);
    if (timerId === null || seenCancel.has(entry.identifier)) continue;
    const timer = byId.get(timerId);
    if (!timer || timer.state === 'paused') {
      seenCancel.add(entry.identifier);
      cancel.push(entry.identifier);
    }
  }

  const dismiss: string[] = [];
  const seenDismiss = new Set<string>();
  for (const identifier of presented) {
    const timerId = timerIdFromNotificationId(identifier);
    if (timerId === null || seenDismiss.has(identifier)) continue;
    const timer = byId.get(timerId);
    // Keep a done timer's notification, and a running-but-due one's (it is
    // ringing in the <= 1 s before the tick marks the timer done).
    const ringing =
      timer !== undefined &&
      (timer.state === 'done' ||
        (timer.state === 'running' && timer.endsAt !== undefined && Date.parse(timer.endsAt) <= nowMs));
    if (!ringing) {
      seenDismiss.add(identifier);
      dismiss.push(identifier);
    }
  }

  return { cancel, schedule, dismiss };
}

/**
 * Timer ids whose OS alarm is known to be armed after a sync run that read
 * the scheduled list successfully (with the same `nowMs` as the plan):
 * - a running timer with its end still ahead is armed unless its schedule
 *   call failed (`failed`) — anything the plan didn't schedule already matched;
 * - a running timer past its end keeps its previous status (its request is
 *   never cancelled and may be firing right now);
 * - paused, done and missing timers are not armed.
 * The in-app alert falls back to stage 1 for any timer not in the set.
 */
export function armedAfterSync(o: {
  prev: ReadonlySet<string>;
  timers: readonly Timer[];
  nowMs: number;
  failed: ReadonlySet<string>;
}): Set<string> {
  const armed = new Set<string>();
  for (const timer of o.timers) {
    if (timer.state !== 'running') continue;
    const armedNow =
      desiredFireTime(timer, o.nowMs) !== null ? !o.failed.has(timer.id) : o.prev.has(timer.id);
    if (armedNow) armed.add(timer.id);
  }
  return armed;
}

/** Validates a tapped notification: ours, with a positive-integer recipe id. */
export function parseTimerNotificationResponse(
  identifier: string,
  data: unknown
): { timerId: string; recipeId: number } | null {
  const timerId = timerIdFromNotificationId(identifier);
  if (timerId === null) return null;
  if (typeof data !== 'object' || data === null) return null;
  const { recipeId, timerId: dataTimerId } = data as { recipeId?: unknown; timerId?: unknown };
  if (typeof recipeId !== 'number' || !Number.isInteger(recipeId) || recipeId < 1) return null;
  if (dataTimerId !== timerId) return null;
  return { timerId, recipeId };
}

export type AlarmPermission = {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
};

/**
 * What to do when a timer starts: nothing (granted, or the notice was already
 * shown), ask the OS (at most once per session, while it still lets us), or
 * show the one-time "notifications are off" notice.
 */
export function nextAlarmPermissionStep(
  p: AlarmPermission,
  o: { askedThisSession: boolean; noticeShown: boolean }
): 'none' | 'request' | 'notice' {
  if (p.status === 'granted') return 'none';
  if (p.canAskAgain && !o.askedThisSession) return 'request';
  return o.noticeShown ? 'none' : 'notice';
}

/**
 * Whether the in-app alert (repeating vibration, until the timer is dismissed,
 * stopped or extended) plays for an expired timer:
 * - OS alarm not armed (denied, Expo Go/web, native failure): always — the
 *   in-app vibration is the alarm (stage 1).
 * - Armed and exact: never — the OS notification is the single ringer, in the
 *   foreground too (see timerForegroundBehavior).
 * - Armed but inexact (the notification may come up to 3/4 of the duration
 *   late): only for a live expiry seen in the foreground, so a timer that
 *   ended in the background never rings in-app on return. The late
 *   notification may still ring as well; accepted.
 */
export function shouldAlertOnExpire(o: {
  osAlarmEnabled: boolean;
  exactAllowed: boolean;
  appActive: boolean;
  endedAgoMs: number;
}): boolean {
  if (!o.osAlarmEnabled) return true;
  if (o.exactAllowed) return false;
  return o.appActive && o.endedAgoMs <= LIVE_EXPIRY_WINDOW_MS;
}

export type ForegroundBehavior = {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
};

/**
 * Foreground presentation: timer notifications are shown with sound (heads-up
 * banner with the Stop action) — the notification is the single ringer while
 * the app is open too; the in-app Dismiss / Stop / +1 min removes it through
 * the reconciler. Anything else is shown silently.
 */
export function timerForegroundBehavior(identifier: string): ForegroundBehavior {
  if (timerIdFromNotificationId(identifier) !== null) {
    return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
  }
  return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
}

/** Ids newly appearing in `running` state vs the previous id set (null prev = baseline → []). */
export function startedTimerIds(
  prev: ReadonlySet<string> | null,
  timers: readonly Timer[]
): string[] {
  if (prev === null) return [];
  return timers.filter((timer) => timer.state === 'running' && !prev.has(timer.id)).map((timer) => timer.id);
}

/**
 * Serial, latest-wins runner: at most one run in flight; requests made
 * meanwhile collapse into a single follow-up run with the latest argument.
 */
export function createLatestRunner<T>(
  run: (arg: T) => Promise<void>,
  onError?: (e: unknown) => void
): { request(arg: T): void; idle(): Promise<void> } {
  let running = false;
  let pending: { arg: T } | null = null;
  let waiters: (() => void)[] = [];

  const pump = () => {
    if (running) return;
    if (!pending) {
      const done = waiters;
      waiters = [];
      for (const resolve of done) resolve();
      return;
    }
    const { arg } = pending;
    pending = null;
    running = true;
    let result: Promise<void>;
    try {
      result = Promise.resolve(run(arg));
    } catch (e) {
      result = Promise.reject(e);
    }
    result
      .then(undefined, (e: unknown) => {
        try {
          onError?.(e);
        } catch {
          // An error reporter must not stall the queue.
        }
      })
      .then(() => {
        running = false;
        pump();
      });
  };

  return {
    request(arg: T) {
      pending = { arg };
      pump();
    },
    idle() {
      if (!running && !pending) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.push(resolve));
    },
  };
}

// --- Exact alarms (stage 2 addendum) ---

/** The "allow alarms" notice is shown in at most this many sessions, ever. */
export const EXACT_ALARM_NOTICE_MAX = 3;

/**
 * Whether to ask for exact-alarm access ("Alarms & reminders") when a timer
 * starts. Without it Android delivers the alarm up to 3/4 of the duration
 * late. Only while the OS alarm works at all, once per session, capped.
 */
export function nextExactAlarmStep(o: {
  osAlarmEnabled: boolean;
  exactAllowed: boolean;
  shownThisSession: boolean;
  timesShown: number;
}): 'none' | 'notice' {
  const show =
    o.osAlarmEnabled &&
    !o.exactAllowed &&
    !o.shownThisSession &&
    o.timesShown < EXACT_ALARM_NOTICE_MAX;
  return show ? 'notice' : 'none';
}

/**
 * Exact access just granted (false → true): re-schedule everything so the
 * pending alarms become exact. An unknown baseline (null) never re-arms.
 */
export function shouldRearmOnExactChange(prev: boolean | null, next: boolean): boolean {
  return prev === false && next;
}

/** A stored notice count: a non-negative integer, else 0. */
export function parseNoticeCount(raw: string | null | undefined): number {
  if (raw == null || !/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : 0;
}
