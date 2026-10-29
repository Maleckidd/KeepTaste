import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useTheme,
  lightColors,
  darkColors,
  Typography,
  Spacing,
  Radius,
  Shadow,
  Motion,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import {
  schedulePendingDelete,
  cancelPendingDelete,
  commitPendingDelete,
} from '@/utils/pendingDelete';

type SnackbarOptions = {
  message: string;
  actionLabel?: string;
  /** Runs when the user taps the action; the snackbar is dismissed. */
  onAction?: () => void;
  /** Runs when the snackbar expires or is replaced (not after onAction). */
  onTimeout?: () => void;
  durationMs?: number;
};

type SnackbarContextValue = {
  showSnackbar: (options: SnackbarOptions) => void;
};

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

// Window y of the visible bar's top edge, or null when no bar is shown — lets a
// FAB slide up out of its way (SPEC.md §6 "A snackbar never covers the FAB").
const SnackbarTopContext = createContext<number | null>(null);

const DEFAULT_DURATION = 5000;

/**
 * For snackbars whose action navigates ("Show", "View list") — 5 s is too
 * short to reach the action one-handed (SPEC.md §6 "Snackbar durations").
 */
export const NAVIGATION_SNACKBAR_MS = 8000;

/**
 * After a bar expires, its spot keeps swallowing taps this long: a tap aimed
 * at the action as it fades must not land on the row underneath (e.g. tick an
 * ingredient on the recipe view, SPEC.md §6 "Snackbar tap guard").
 */
const TAP_GUARD_MS = 1000;

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  // The bar uses inverted colors (c.text as background), so the accent comes
  // from the opposite palette to keep contrast.
  const accent = c === darkColors ? lightColors.primary : darkColors.primary;

  const [current, setCurrent] = useState<SnackbarOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef<SnackbarOptions | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const barRef = useRef<View>(null);
  const [barTop, setBarTop] = useState<number | null>(null);
  const barHeight = useRef(0);
  const guardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guardHeight, setGuardHeight] = useState<number | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const clearGuard = () => {
    if (guardTimer.current) {
      clearTimeout(guardTimer.current);
      guardTimer.current = null;
    }
    setGuardHeight(null);
  };

  const hide = useCallback(
    (guard = false) => {
      clearTimer();
      currentRef.current = null;
      if (guard) {
        clearGuard();
        setGuardHeight(barHeight.current);
        guardTimer.current = setTimeout(clearGuard, Motion.duration.fast + TAP_GUARD_MS);
      }
      Animated.timing(opacity, {
        toValue: 0,
        duration: Motion.duration.fast,
        useNativeDriver: true,
      }).start(() => {
        setCurrent(null);
        setBarTop(null);
      });
    },
    [opacity]
  );

  // Only an expiry arms the guard — the user didn't choose to close the bar,
  // so a tap may still be on its way to it.
  const expire = useCallback(() => {
    const entry = currentRef.current;
    hide(true);
    entry?.onTimeout?.();
  }, [hide]);

  const showSnackbar = useCallback(
    (options: SnackbarOptions) => {
      // A new snackbar replaces the old one — the old entry's pending work
      // (e.g. a delete commit) must not be lost, so it expires immediately.
      const previous = currentRef.current;
      clearTimer();
      previous?.onTimeout?.();

      clearGuard();
      currentRef.current = options;
      setCurrent(options);
      Animated.timing(opacity, {
        toValue: 1,
        duration: Motion.duration.base,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(expire, options.durationMs ?? DEFAULT_DURATION);
    },
    [expire, opacity]
  );

  const barBottom = insets.bottom + Spacing.xxl + Spacing.xxl;

  const handleAction = () => {
    const entry = currentRef.current;
    hide();
    entry?.onAction?.();
  };

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      <SnackbarTopContext.Provider value={barTop}>{children}</SnackbarTopContext.Provider>
      {current ? (
        <Animated.View
          ref={barRef}
          onLayout={(e) => {
            barHeight.current = e.nativeEvent.layout.height;
            barRef.current?.measureInWindow((_x, y) => setBarTop(y));
          }}
          style={[
            styles.bar,
            {
              backgroundColor: c.text,
              bottom: barBottom,
              opacity,
            },
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text
            style={[styles.message, { color: c.background }]}
            numberOfLines={2}
          >
            {current.message}
          </Text>
          {current.actionLabel ? (
            <Pressable
              onPress={handleAction}
              accessibilityRole="button"
              accessibilityLabel={current.actionLabel}
              hitSlop={8}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.actionText, { color: accent }]}>
                {current.actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
      {guardHeight !== null && !current ? (
        // Invisible, touch-absorbing stand-in for the bar that just expired.
        <View
          style={[styles.guard, { bottom: barBottom, height: guardHeight }]}
          onStartShouldSetResponder={() => true}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        />
      ) : null}
    </SnackbarContext.Provider>
  );
}

/** Window y of the visible snackbar's top edge, or null when none is shown. */
export function useSnackbarTop(): number | null {
  return useContext(SnackbarTopContext);
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar must be used within SnackbarProvider');
  return ctx;
}

/**
 * Undo-delete flow: registers the commit in the pending-delete registry and
 * shows a "Deleted — Undo" snackbar wired to cancel/commit it.
 */
export function useUndoDelete() {
  const { showSnackbar } = useSnackbar();
  const t = useT();

  return useCallback(
    (key: string, name: string, commit: () => void | Promise<void>) => {
      schedulePendingDelete(key, commit);
      showSnackbar({
        message: t('undo.deleted', { name }),
        actionLabel: t('undo.action'),
        onAction: () => {
          cancelPendingDelete(key);
        },
        onTimeout: () => {
          commitPendingDelete(key);
        },
      });
    },
    [showSnackbar, t]
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    minHeight: 52,
    borderRadius: Radius.md,
    ...Shadow.lg,
  },
  guard: {
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
  },
  message: {
    flex: 1,
    fontSize: Typography.size.base,
    lineHeight: Typography.size.base * 1.4,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
