// Root-level cooking-timer state (SPEC.md §5.21). Timers outlive the recipe
// screen that started them, so they live here rather than in a screen; the
// app has no global store, and this is a deliberately narrow context — not a
// general state container.
//
// Three contexts so the 1 s clock re-renders only what shows a countdown:
// - TimerContext: the timers, stable actions, and the bar's expanded state
// - TimerClockContext: `now` (epoch ms), ticking only while a timer runs
// - TimerLayoutContext: where the bar sits, for snackbar/FAB/padding offsets
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { Spacing } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import { getActiveTimersJson, saveActiveTimersJson } from '@/db/settings';
import { stopTimerAlert, timerDoneAlert } from '@/utils/haptics';
import { isExactAlarmAllowed, isTimerAlarmArmed } from '@/utils/timerAlarm';
import { shouldAlertOnExpire } from '@/utils/timerNotifications';
import {
  expireDue,
  findTimerForChip,
  parseStoredTimers,
  serializeTimers,
  stillRinging,
  timerLabel,
  timersReducer,
  type Timer,
  type TimerAction,
} from '@/utils/timers';

export type StartTimerInput = {
  recipeId: number;
  sourceKey: string;
  title: string;
  step: number | null;
  durationSec: number;
};

type TimerContextValue = {
  timers: Timer[];
  /** True once the persisted-timers read has settled (success or failure). */
  loaded: boolean;
  startTimer: (input: StartTimerInput) => string;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string) => void;
  addMinute: (id: string) => void;
  /** Stops a timer; on a done timer this is "Dismiss". */
  stopTimer: (id: string) => void;
  stopTimersForRecipe: (recipeId: number) => void;
  stopAllTimers: () => void;
  /** Bar expanded into the full list; `highlightId` marks the row a chip opened. */
  expanded: boolean;
  highlightId: string | null;
  openControls: (id?: string) => void;
  closeControls: () => void;
  /** Height of the bottom tab bar, reported by app/(tabs)/_layout.tsx. */
  tabBarHeight: number;
  setTabBarHeight: (height: number) => void;
  /** Reported by TimerBar; null while the bar is hidden. */
  setBarLayout: (layout: BarLayout | null) => void;
};

export type BarLayout = {
  /** Window y of the bar's top edge. */
  top: number | null;
  /** Distance from the window bottom to the bar's top edge. */
  inset: number;
  height: number;
};

const TimerContext = createContext<TimerContextValue | null>(null);
const TimerClockContext = createContext<number>(0);
const TimerLayoutContext = createContext<BarLayout | null>(null);

type ProviderAction = TimerAction | { type: 'hydrate'; timers: Timer[] };

// Stored timers win; anything started before hydration finished is kept —
// unless it duplicates a stored timer by id, or by chip (recipeId +
// sourceKey) while the stored one is still running or paused.
function providerReducer(state: Timer[], action: ProviderAction): Timer[] {
  if (action.type === 'hydrate') {
    if (action.timers.length === 0) return state;
    const ids = new Set(action.timers.map((t) => t.id));
    const activeChips = new Set(
      action.timers
        .filter((t) => t.state !== 'done')
        .map((t) => `${t.recipeId}\u0000${t.sourceKey}`)
    );
    const kept = state.filter(
      (t) => !ids.has(t.id) && !activeChips.has(`${t.recipeId}\u0000${t.sourceKey}`)
    );
    return [...action.timers, ...kept];
  }
  return timersReducer(state, action);
}

function newTimerId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [timers, dispatch] = useReducer(providerReducer, []);
  const [hydrated, setHydrated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [tabBarHeight, setTabBarHeightState] = useState(0);
  const [barLayout, setBarLayoutState] = useState<BarLayout | null>(null);

  // Latest values for the interval / AppState callbacks.
  const timersRef = useRef(timers);
  timersRef.current = timers;
  const tRef = useRef(t);
  tRef.current = t;
  // Done timers whose in-app alarm is ringing. One repeating vibration covers
  // them all: it starts when the set goes empty → non-empty and stops when the
  // last one is dismissed, stopped or extended (+1 min). Timers that load as
  // done at launch never join it.
  const ringingRef = useRef<Set<string>>(new Set());

  // Load persisted timers once. Timers that ended while the app was gone come
  // back as done, silently (parseStoredTimers) — no alarm at launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await getActiveTimersJson();
        if (cancelled) return;
        dispatch({ type: 'hydrate', timers: parseStoredTimers(raw, Date.now()) });
        setHydrated(true);
        setLoaded(true);
      } catch {
        // Unreadable — timers still work in memory this session, but nothing
        // is persisted (`hydrated` stays false), so a failed read can never
        // overwrite the stored timers with []. `loaded` still flips: the OS
        // alarms (TimerNotifications) then follow the in-memory timers.
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every change. The tick keeps the same array when nothing
  // expired, so this does not write once per second.
  useEffect(() => {
    if (!hydrated) return;
    saveActiveTimersJson(serializeTimers(timers)).catch(() => {
      // Persisting failed; the in-memory timers keep running.
    });
  }, [timers, hydrated]);

  const tick = useCallback(() => {
    const at = Date.now();
    const prev = timersRef.current;
    const { timers: next, expiredIds } = expireDue(prev, at);
    // Eagerly advance the ref so a second tick before re-render (interval and
    // AppState firing together) cannot alarm twice for the same timer.
    timersRef.current = next;
    setNow(at);
    if (expiredIds.length === 0) return;
    dispatch({ type: 'tick', now: at });
    for (const id of expiredIds) {
      const timer = next.find((x) => x.id === id);
      if (!timer) continue;
      // With this timer's OS alarm armed and exact (stage 2) the insistent
      // notification is the single ringer, in the foreground too. Armed but
      // inexact: the in-app alarm rings only for a live expiry seen in the
      // foreground. Not armed (denied, Expo Go/web, or any native failure) →
      // the in-app alarm always rings (stage 1). Either way it repeats until
      // the timer is dismissed, stopped or extended.
      const endsAtMs = Date.parse(prev.find((x) => x.id === id)?.endsAt ?? '');
      const endedAgoMs = Number.isFinite(endsAtMs) ? at - endsAtMs : 0;
      if (
        shouldAlertOnExpire({
          osAlarmEnabled: isTimerAlarmArmed(id),
          exactAllowed: isExactAlarmAllowed(),
          appActive: AppState.currentState === 'active',
          endedAgoMs,
        })
      ) {
        const wasSilent = ringingRef.current.size === 0;
        ringingRef.current.add(id);
        if (wasSilent) timerDoneAlert();
      }
      AccessibilityInfo.announceForAccessibility(
        tRef.current('timer.doneAnnounce', {
          label: timerLabel(tRef.current, timer.title, timer.step),
        })
      );
    }
  }, []);

  // The clock runs only while at least one timer is running.
  const hasRunning = timers.some((x) => x.state === 'running');
  useEffect(() => {
    if (!hasRunning) return;
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [hasRunning, tick]);

  // Silence the in-app alarm once no ringing timer is still done (dismissed,
  // stopped, or restarted with +1 min). The tick adds to the ref before its
  // dispatch lands, so this effect sees the new timer as done, never as gone.
  useEffect(() => {
    const prevSize = ringingRef.current.size;
    // timersRef, not `timers`: a tick may already have advanced it past this
    // render, and a stale list would drop the id the tick just started ringing.
    const next = stillRinging(ringingRef.current, timersRef.current);
    ringingRef.current = next;
    if (prevSize > 0 && next.size === 0) stopTimerAlert();
  }, [timers]);

  // Stop any ringing vibration if the provider goes away.
  useEffect(() => {
    return () => {
      if (ringingRef.current.size > 0) stopTimerAlert();
      ringingRef.current = new Set();
    };
  }, []);

  // Refresh `now` whenever the timers change (start/resume/+1 min), so a new
  // countdown never renders against a stale clock.
  useEffect(() => {
    setNow(Date.now());
  }, [timers]);

  // Back in the foreground: catch up at once (a timer may have ended while
  // the app was in the background). Without the OS alarm this rings on
  // return (stage 1); with it, the notification is ringing — see tick.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => sub.remove();
  }, [tick]);

  // Nothing left to show — collapse.
  useEffect(() => {
    if (timers.length === 0) {
      setExpanded(false);
      setHighlightId(null);
    }
  }, [timers.length]);

  const startTimer = useCallback((input: StartTimerInput) => {
    const existing = findTimerForChip(timersRef.current, input.recipeId, input.sourceKey);
    if (existing && existing.state !== 'done') return existing.id;
    const id = newTimerId();
    dispatch({ type: 'start', id, now: Date.now(), ...input });
    return id;
  }, []);
  const pauseTimer = useCallback((id: string) => {
    dispatch({ type: 'pause', id, now: Date.now() });
  }, []);
  const resumeTimer = useCallback((id: string) => {
    dispatch({ type: 'resume', id, now: Date.now() });
  }, []);
  const addMinute = useCallback((id: string) => {
    dispatch({ type: 'addMinute', id, now: Date.now() });
  }, []);
  const stopTimer = useCallback((id: string) => {
    dispatch({ type: 'stop', id });
  }, []);
  const stopTimersForRecipe = useCallback((recipeId: number) => {
    dispatch({ type: 'stopForRecipe', recipeId });
  }, []);
  const stopAllTimers = useCallback(() => {
    dispatch({ type: 'stopAll' });
  }, []);
  const openControls = useCallback((id?: string) => {
    setExpanded(true);
    setHighlightId(id ?? null);
  }, []);
  const closeControls = useCallback(() => {
    setExpanded(false);
    setHighlightId(null);
  }, []);
  const setTabBarHeight = useCallback((height: number) => {
    setTabBarHeightState((prev) => (Math.abs(prev - height) < 0.5 ? prev : height));
  }, []);
  const setBarLayout = useCallback((layout: BarLayout | null) => {
    setBarLayoutState((prev) => {
      if (prev === layout) return prev;
      if (
        prev &&
        layout &&
        prev.top === layout.top &&
        prev.inset === layout.inset &&
        prev.height === layout.height
      ) {
        return prev;
      }
      return layout;
    });
  }, []);

  const value = useMemo<TimerContextValue>(
    () => ({
      timers,
      loaded,
      startTimer,
      pauseTimer,
      resumeTimer,
      addMinute,
      stopTimer,
      stopTimersForRecipe,
      stopAllTimers,
      expanded,
      highlightId,
      openControls,
      closeControls,
      tabBarHeight,
      setTabBarHeight,
      setBarLayout,
    }),
    [
      timers,
      loaded,
      startTimer,
      pauseTimer,
      resumeTimer,
      addMinute,
      stopTimer,
      stopTimersForRecipe,
      stopAllTimers,
      expanded,
      highlightId,
      openControls,
      closeControls,
      tabBarHeight,
      setTabBarHeight,
      setBarLayout,
    ]
  );

  return (
    <TimerContext.Provider value={value}>
      <TimerClockContext.Provider value={now}>
        <TimerLayoutContext.Provider value={barLayout}>{children}</TimerLayoutContext.Provider>
      </TimerClockContext.Provider>
    </TimerContext.Provider>
  );
}

export function useTimers(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimers must be used within TimerProvider');
  return ctx;
}

/** Current clock (epoch ms) — advances every second while a timer runs. */
export function useTimerNow(): number {
  return useContext(TimerClockContext);
}

/** Window y of the timer bar's top edge, or null while the bar is hidden. */
export function useTimerBarTop(): number | null {
  return useContext(TimerLayoutContext)?.top ?? null;
}

/**
 * Distance from the window bottom to the bar's top edge (its bottom offset +
 * height), or null while hidden. Floating UI (snackbar, backup banner) sits
 * above this.
 */
export function useTimerBarWindowInset(): number | null {
  return useContext(TimerLayoutContext)?.inset ?? null;
}

/** Extra bottom padding a scrolling screen needs so its end clears the bar. */
export function useTimerBarClearance(): number {
  const layout = useContext(TimerLayoutContext);
  return layout ? layout.height + 2 * Spacing.sm : 0;
}
