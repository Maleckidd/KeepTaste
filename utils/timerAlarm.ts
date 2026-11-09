// Native side of the cooking-timer background alarm (SPEC.md §5.21, stage 2):
// one local OS notification per running timer, at its end time. A thin, gated
// wrapper around expo-notifications — the decisions (what to schedule, cancel
// or dismiss; permission steps; foreground behaviour) live in the pure
// utils/timerNotifications.ts.
//
// Gate (like utils/shareIntent.ts): Android dev/release builds only. Expo Go
// warns as soon as expo-notifications is imported, web has no scheduler, and
// iOS is not a product platform — so the module is required lazily, and only
// when the gate is open. Everything below is a no-op when it is closed.
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { NotificationResponse } from 'expo-notifications';
import type { Translator } from './i18n';
import type { Timer } from './timers';
import { ALARM_PATTERN } from './haptics';
import {
  canScheduleExactAlarms,
  openExactAlarmSettings as openNativeExactAlarmSettings,
} from '@/modules/exactalarm';
import {
  TIMER_CHANNEL_ID,
  armedAfterSync,
  createLatestRunner,
  fireTimeFromTrigger,
  parseTimerNotificationResponse,
  planTimerNotifications,
  timerForegroundBehavior,
  type AlarmPermission,
} from './timerNotifications';

type NotificationsModule = typeof import('expo-notifications');

export const isTimerAlarmAvailable: boolean =
  Platform.OS === 'android' &&
  !isRunningInExpoGo() &&
  requireOptionalNativeModule('ExpoNotificationScheduler') != null;

let notificationsModule: NotificationsModule | null = null;

/** Lazy require — call only behind isTimerAlarmAvailable. */
function notifications(): NotificationsModule {
  if (!notificationsModule) {
    notificationsModule = require('expo-notifications') as NotificationsModule;
  }
  return notificationsModule;
}

const UNAVAILABLE: AlarmPermission = { status: 'denied', canAskAgain: false };

// --- Foreground handler ---

let initialized = false;

/**
 * Installs the foreground handler (idempotent): timer notifications are
 * presented with sound while the app is open too — the notification is the
 * single ringer (see timerForegroundBehavior).
 */
export function initTimerAlarms(): void {
  if (!isTimerAlarmAvailable || initialized) return;
  initialized = true;
  notifications().setNotificationHandler({
    handleNotification: async (notification) =>
      timerForegroundBehavior(notification.request.identifier),
  });
}

// --- Permission ---

let permission: AlarmPermission | null = null;

function toAlarmPermission(r: { granted: boolean; status: string; canAskAgain: boolean }): AlarmPermission {
  const status = r.granted ? 'granted' : r.status === 'undetermined' ? 'undetermined' : 'denied';
  return { status, canAskAgain: r.canAskAgain };
}

// Timer ids whose OS alarm is known to be scheduled (see armedAfterSync).
let armed: ReadonlySet<string> = new Set();

/**
 * True when this timer's OS alarm can actually ring: available, permission
 * granted (cached), and its notification confirmed scheduled by the last sync.
 * Any native failure leaves the timer out, so the in-app alert falls back to
 * stage 1 (alert on return) instead of staying silent.
 */
export function isTimerAlarmArmed(timerId: string): boolean {
  return isTimerAlarmAvailable && permission?.status === 'granted' && armed.has(timerId);
}

/** Reads the current notification permission and caches it. */
export async function refreshTimerAlarmPermission(): Promise<AlarmPermission> {
  if (!isTimerAlarmAvailable) return UNAVAILABLE;
  permission = toAlarmPermission(await notifications().getPermissionsAsync());
  return permission;
}

/**
 * Shows the OS permission dialog and caches the answer. On Android 13+ the
 * dialog appears only once a channel exists — call ensureTimerChannel first.
 */
export async function requestTimerAlarmPermission(): Promise<AlarmPermission> {
  if (!isTimerAlarmAvailable) return UNAVAILABLE;
  permission = toAlarmPermission(await notifications().requestPermissionsAsync());
  return permission;
}

// --- Channel ---

let channelKey: string | null = null;
let channelPromise: Promise<void> | null = null;

/**
 * Creates (or renames) the `timers` channel. Memoized by the localized
 * name/description, so it reruns only on a language change. Android freezes
 * importance, sound and vibration after the first creation — only the name
 * and description follow later calls.
 */
export function ensureTimerChannel(t: Translator): Promise<void> {
  if (!isTimerAlarmAvailable) return Promise.resolve();
  const name = t('timer.listTitle');
  const description = t('timer.channelDescription');
  const key = `${name}\u0000${description}`;
  if (channelKey === key && channelPromise) return channelPromise;
  const N = notifications();
  const promise = N.setNotificationChannelAsync(TIMER_CHANNEL_ID, {
    name,
    description,
    importance: N.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: ALARM_PATTERN,
    lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
  }).then(() => undefined);
  channelKey = key;
  channelPromise = promise;
  promise.catch(() => {
    // Let the next call retry.
    if (channelPromise === promise) {
      channelKey = null;
      channelPromise = null;
    }
  });
  return promise;
}

// --- Reconciler ---

type SyncArgs = { timers: Timer[]; t: Translator };

// Re-schedule every running timer on the next sync, even if listed: pending
// on the first sync of each JS process (a force-stop drops the OS alarms while
// the stored requests survive) and after exact access is granted. Consumed by
// the run that takes it, and put back if that run doesn't fully succeed — a
// flag rather than "rearmed" so a request made while another run is in flight
// is never lost.
let rearmPending = true;

async function runSync(args: SyncArgs): Promise<void> {
  const rearm = rearmPending;
  rearmPending = false;
  let ok = false;
  try {
    ok = await syncOnce(args, rearm);
  } finally {
    if (rearm && !ok) rearmPending = true;
  }
}

/** One reconcile pass; true when every OS call succeeded. */
async function syncOnce({ timers, t }: SyncArgs, rearm: boolean): Promise<boolean> {
  const N = notifications();
  // A missing channel is not fatal: expo posts on its fallback channel.
  await ensureTimerChannel(t).catch(() => {});
  let scheduled: Awaited<ReturnType<NotificationsModule['getAllScheduledNotificationsAsync']>>;
  let presented: Awaited<ReturnType<NotificationsModule['getPresentedNotificationsAsync']>>;
  try {
    [scheduled, presented] = await Promise.all([
      N.getAllScheduledNotificationsAsync(),
      N.getPresentedNotificationsAsync(),
    ]);
  } catch (e) {
    // OS state unknown — trust no alarm until a later sync confirms it.
    armed = new Set();
    throw e;
  }
  const nowMs = Date.now();
  const plan = planTimerNotifications({
    timers,
    nowMs,
    t,
    scheduled: scheduled.map((request) => ({
      identifier: request.identifier,
      fireAtMs: fireTimeFromTrigger(request.trigger),
      title: request.content.title ?? null,
      body: request.content.body ?? null,
    })),
    presented: presented.map((notification) => notification.request.identifier),
    rearm,
  });

  let ok = true;
  const fail = () => {
    ok = false;
  };
  const failed = new Set<string>();
  await Promise.all(plan.cancel.map((id) => N.cancelScheduledNotificationAsync(id).catch(fail)));
  await Promise.all(plan.dismiss.map((id) => N.dismissNotificationAsync(id).catch(fail)));
  for (const request of plan.schedule) {
    await N.scheduleNotificationAsync({
      identifier: request.identifier,
      content: {
        title: request.title,
        body: request.body,
        // Same shape as buildTimerNotificationContent's data; the native
        // TimerPresentationDelegate reads `stopLabel` for the Stop action.
        data: { recipeId: request.recipeId, timerId: request.timerId, stopLabel: t('timer.alarmStop') },
        sound: 'default',
        priority: N.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: request.fireAtMs,
        channelId: TIMER_CHANNEL_ID,
      },
    }).catch(() => {
      fail();
      failed.add(request.timerId);
    });
  }
  armed = armedAfterSync({ prev: armed, timers, nowMs, failed });
  return ok;
}

const runner = createLatestRunner<SyncArgs>(runSync, () => {
  // Best-effort: the next timer change reconciles again.
});

/** Reconciles the OS notifications with `timers` (serial, latest wins). */
export function syncTimerNotifications(timers: Timer[], t: Translator): void {
  if (!isTimerAlarmAvailable) return;
  runner.request({ timers, t });
}

// --- Exact alarms (stage 2 addendum) ---

/**
 * Whether the OS alarm will be exact. expo-notifications schedules an exact
 * alarm whenever Android allows it; otherwise it may ring up to 3/4 of the
 * duration late. False when the alarm is unavailable at all; a missing
 * `ExactAlarm` native module (a build without it) or an error counts as
 * allowed, so the user is never asked for something we can't act on.
 */
export function isExactAlarmAllowed(): boolean {
  if (!isTimerAlarmAvailable) return false;
  return canScheduleExactAlarms();
}

/** Opens the system "Alarms & reminders" screen for this app. Never throws. */
export async function openExactAlarmSettings(): Promise<void> {
  if (!isTimerAlarmAvailable) return;
  try {
    await openNativeExactAlarmSettings();
  } catch {
    // No such screen — nothing more we can do.
  }
}

/**
 * Re-schedules every pending timer alarm (e.g. exact access was just
 * granted, so the existing inexact alarms should become exact).
 */
export function requestTimerAlarmRearm(timers: Timer[], t: Translator): void {
  if (!isTimerAlarmAvailable) return;
  rearmPending = true;
  runner.request({ timers, t });
}

// --- Taps ---

// Module-level so a remounted subscriber never handles the same tap twice.
const handledTaps = new Set<string>();

/**
 * Delivers taps on timer notifications (cold start included) — once per
 * delivered notification. Only the default action (the body tap) counts.
 */
export function subscribeTimerNotificationTaps(
  onTap: (tap: { timerId: string; recipeId: number }) => void
): () => void {
  if (!isTimerAlarmAvailable) return () => {};
  const N = notifications();
  const handle = (response: NotificationResponse | null) => {
    if (!response || response.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
    const { request, date } = response.notification;
    const tap = parseTimerNotificationResponse(request.identifier, request.content.data);
    if (!tap) return;
    const key = `${request.identifier}|${date}`;
    if (handledTaps.has(key)) return;
    handledTaps.add(key);
    onTap(tap);
    try {
      N.clearLastNotificationResponse();
    } catch {
      // Not critical — the dedupe set already guards this process.
    }
  };
  const subscription = N.addNotificationResponseReceivedListener(handle);
  try {
    handle(N.getLastNotificationResponse());
  } catch {
    // No stored response available.
  }
  return () => subscription.remove();
}
