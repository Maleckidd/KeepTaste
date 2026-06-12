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

const DEFAULT_DURATION = 5000;

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

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    currentRef.current = null;
    Animated.timing(opacity, {
      toValue: 0,
      duration: Motion.duration.fast,
      useNativeDriver: true,
    }).start(() => setCurrent(null));
  }, [opacity]);

  const expire = useCallback(() => {
    const entry = currentRef.current;
    hide();
    entry?.onTimeout?.();
  }, [hide]);

  const showSnackbar = useCallback(
    (options: SnackbarOptions) => {
      // A new snackbar replaces the old one — the old entry's pending work
      // (e.g. a delete commit) must not be lost, so it expires immediately.
      const previous = currentRef.current;
      clearTimer();
      previous?.onTimeout?.();

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

  const handleAction = () => {
    const entry = currentRef.current;
    hide();
    entry?.onAction?.();
  };

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      {current ? (
        <Animated.View
          style={[
            styles.bar,
            {
              backgroundColor: c.text,
              bottom: insets.bottom + Spacing.xxl + Spacing.xxl,
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
    </SnackbarContext.Provider>
  );
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
