// Bridge between the cooking timers and the OS background alarm (SPEC.md
// §5.21, stage 2). Renders nothing. Keeps one scheduled notification per
// running timer (utils/timerAlarm.ts reconciles), asks for the notification
// permission the first time a timer starts (then, if needed, for exact-alarm
// access), re-arms the alarms when exact access is granted, and opens the
// recipe when an alarm is tapped. The alarm notification rings until the user
// acts (insistent flag + a Stop action, added natively by modules/exactalarm's
// TimerPresentationDelegate); the reconciler dismisses it — which also
// silences it — once its timer is dismissed, stopped or extended in the app.
// Mounted only where the alarm is available (Android dev / release build) — in
// Expo Go and on web the timers keep stage-1 behaviour.
// Must sit inside TimerProvider, LanguageProvider and SnackbarProvider.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Linking } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useLanguageReady, useT } from '@/i18n/LanguageProvider';
import { NAVIGATION_SNACKBAR_MS, useSnackbar } from '@/components/ui/SnackbarProvider';
import { useTimers } from '@/components/timers/TimerProvider';
import { getRecipeById } from '@/db/recipes';
import {
  getTimerExactNoticeCount,
  incrementTimerExactNoticeCount,
  isTimerAlarmNoticeShown,
  markTimerAlarmNoticeShown,
} from '@/db/settings';
import { isAppReady, subscribeAppReady } from '@/utils/appReady';
import {
  ensureTimerChannel,
  initTimerAlarms,
  isExactAlarmAllowed,
  isTimerAlarmAvailable,
  openExactAlarmSettings,
  refreshTimerAlarmPermission,
  requestTimerAlarmPermission,
  requestTimerAlarmRearm,
  subscribeTimerNotificationTaps,
  syncTimerNotifications,
} from '@/utils/timerAlarm';
import {
  EXACT_ALARM_NOTICE_MAX,
  nextAlarmPermissionStep,
  nextExactAlarmStep,
  shouldRearmOnExactChange,
  startedTimerIds,
} from '@/utils/timerNotifications';
import { isModalFormRoute } from '@/utils/timers';

export default function TimerNotifications() {
  return isTimerAlarmAvailable ? <TimerNotificationsNative /> : null;
}

function TimerNotificationsNative() {
  const { timers, loaded } = useTimers();
  const t = useT();
  const languageReady = useLanguageReady();
  const { showSnackbar } = useSnackbar();
  const router = useRouter();
  const pathname = usePathname();
  const appReady = useSyncExternalStore(subscribeAppReady, isAppReady, isAppReady);

  const tRef = useRef(t);
  tRef.current = t;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const timersRef = useRef(timers);
  timersRef.current = timers;
  const syncReadyRef = useRef(false);
  syncReadyRef.current = loaded && languageReady;

  // Foreground handler + permission cache; re-read the permission on return
  // (the user may have toggled it in system settings). Exact-alarm access is
  // re-read too: granted since the last check (false → true) → re-schedule
  // every alarm so the pending inexact ones become exact. Before the first
  // sync there is nothing to do — that sync re-arms anyway.
  const exactRef = useRef<boolean | null>(null);
  useEffect(() => {
    const checkExact = () => {
      const allowed = isExactAlarmAllowed();
      if (shouldRearmOnExactChange(exactRef.current, allowed) && syncReadyRef.current) {
        requestTimerAlarmRearm(timersRef.current, tRef.current);
      }
      exactRef.current = allowed;
    };
    initTimerAlarms();
    void refreshTimerAlarmPermission().catch(() => {});
    checkExact();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refreshTimerAlarmPermission().catch(() => {});
      checkExact();
    });
    return () => sub.remove();
  }, []);

  // Channel name/description follow the UI language.
  useEffect(() => {
    if (!languageReady) return;
    void ensureTimerChannel(t).catch(() => {});
  }, [t, languageReady]);

  // Reconcile on every timer or language change — only once the persisted
  // timers have loaded, so a cold start never cancels the stored alarms.
  useEffect(() => {
    if (!loaded || !languageReady) return;
    syncTimerNotifications(timers, t);
  }, [timers, t, loaded, languageReady]);

  // Permission: asked when a timer is started (never at launch), at most once
  // per session; if still off, a one-time notice with a shortcut to settings.
  // With notifications on but exact alarms off (Android 14+ default), a
  // notice asks for "Alarms & reminders" — once per session, in at most
  // EXACT_ALARM_NOTICE_MAX sessions, never in the same flow as the alarm-off
  // notice.
  const knownIdsRef = useRef<Set<string> | null>(null);
  const flowRef = useRef(false);
  const askedRef = useRef(false);
  const noticeShownRef = useRef(false);
  const exactShownRef = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    const started = startedTimerIds(knownIdsRef.current, timers);
    knownIdsRef.current = new Set(timers.map((timer) => timer.id));
    if (started.length === 0 || flowRef.current) return;
    flowRef.current = true;
    void (async () => {
      try {
        let perm = await refreshTimerAlarmPermission();
        const noticeShown =
          noticeShownRef.current || (await isTimerAlarmNoticeShown().catch(() => false));
        let step = nextAlarmPermissionStep(perm, {
          askedThisSession: askedRef.current,
          noticeShown,
        });
        if (step === 'request') {
          askedRef.current = true;
          // Android 13+ shows the dialog only once a channel exists.
          await ensureTimerChannel(tRef.current);
          perm = await requestTimerAlarmPermission();
          step = nextAlarmPermissionStep(perm, { askedThisSession: true, noticeShown });
        }
        if (step === 'notice') {
          noticeShownRef.current = true;
          showSnackbar({
            message: tRef.current('timer.alarmOffNotice'),
            actionLabel: tRef.current('timer.alarmOffAction'),
            onAction: () => void Linking.openSettings().catch(() => {}),
            durationMs: NAVIGATION_SNACKBAR_MS,
          });
          void markTimerAlarmNoticeShown().catch(() => {});
          return;
        }
        const osAlarmEnabled = perm.status === 'granted';
        const exactAllowed = isExactAlarmAllowed();
        if (!osAlarmEnabled || exactAllowed || exactShownRef.current) return;
        // An unreadable count counts as capped — never nag on a DB error.
        const timesShown = await getTimerExactNoticeCount().catch(() => EXACT_ALARM_NOTICE_MAX);
        const exactStep = nextExactAlarmStep({
          osAlarmEnabled,
          exactAllowed,
          shownThisSession: exactShownRef.current,
          timesShown,
        });
        if (exactStep === 'notice') {
          exactShownRef.current = true;
          showSnackbar({
            message: tRef.current('timer.exactNotice'),
            actionLabel: tRef.current('timer.exactAction'),
            onAction: () => void openExactAlarmSettings(),
            durationMs: NAVIGATION_SNACKBAR_MS,
          });
          void incrementTimerExactNoticeCount().catch(() => {});
        }
      } catch {
        // Permission APIs failed — the timers keep their in-app alert.
      } finally {
        flowRef.current = false;
      }
    })();
  }, [timers, loaded, showSnackbar]);

  // Tapping an alarm opens its recipe once the first screen is up. A deleted
  // recipe navigates nowhere (recipe/[id] has no not-found state); an already
  // open one is not pushed twice; an open modal form is never covered (same
  // rule as the share handler) — the app just comes to the foreground.
  const [pendingRecipeId, setPendingRecipeId] = useState<number | null>(null);
  useEffect(
    () => subscribeTimerNotificationTaps(({ recipeId }) => setPendingRecipeId(recipeId)),
    []
  );
  useEffect(() => {
    if (pendingRecipeId === null || !appReady) return;
    let cancelled = false;
    void (async () => {
      const recipe = await getRecipeById(pendingRecipeId).catch(() => undefined);
      if (cancelled) return;
      setPendingRecipeId(null);
      const path = pathnameRef.current;
      if (!recipe || isModalFormRoute(path) || path === `/recipe/${pendingRecipeId}`) return;
      router.push({ pathname: '/recipe/[id]', params: { id: String(pendingRecipeId) } });
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingRecipeId, appReady, router]);

  return null;
}
