// Root-level timer bar (SPEC.md §5.21): a floating pill above the tab bar (tab
// routes) or the bottom inset (stack screens), on every screen except modal
// forms and while the keyboard is up. Collapsed it shows the soonest timer;
// tapped it expands into the full list with controls. Same overlay technique
// as BackupBanner — rendered after RootStack in app/_layout.tsx.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter, useSegments } from 'expo-router';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
  Touch,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import type { Translator } from '@/utils/i18n';
import {
  barSummary,
  formatCountdown,
  formatDurationWords,
  orderTimers,
  remainingSeconds,
  shouldShowTimerBar,
  timerLabel,
  type Timer,
} from '@/utils/timers';
import { useTimerNow, useTimers } from './TimerProvider';

function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** Countdown, or the paused / done word. */
function statusText(t: Translator, timer: Timer, now: number): string {
  if (timer.state === 'done') return t('timer.done');
  if (timer.state === 'paused') return t('timer.paused');
  return formatCountdown(remainingSeconds(timer, now));
}

/** Spoken form of statusText for accessibility labels. */
function statusSpoken(t: Translator, timer: Timer, now: number): string {
  if (timer.state === 'done') return t('timer.done');
  const words = formatDurationWords(remainingSeconds(timer, now), t);
  return timer.state === 'paused' ? `${t('timer.paused')}, ${words}` : words;
}

function TextAction({
  label,
  onPress,
  color,
  styles,
}: {
  label: string;
  onPress: () => void;
  color: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={Spacing.xs}
      style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
    >
      <Text style={[styles.textActionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

export default function TimerBar() {
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const keyboardVisible = useKeyboardVisible();
  const now = useTimerNow();
  const {
    timers,
    expanded,
    highlightId,
    openControls,
    closeControls,
    pauseTimer,
    resumeTimer,
    addMinute,
    stopTimer,
    tabBarHeight,
    setBarLayout,
  } = useTimers();

  const visible = shouldShowTimerBar({
    pathname,
    keyboardVisible,
    timerCount: timers.length,
  });
  const onTabs = (segments as string[])[0] === '(tabs)';
  const bottom = (onTabs ? tabBarHeight : insets.bottom) + Spacing.sm;

  const ref = useRef<View>(null);
  const [height, setHeight] = useState(0);

  // Report "hidden" so the snackbar, FAB and paddings drop their offsets.
  useEffect(() => {
    if (!visible) setBarLayout(null);
  }, [visible, setBarLayout]);
  useEffect(() => () => setBarLayout(null), [setBarLayout]);

  // Bottom changes (tabs ↔ stack) re-run onLayout, which re-measures; the
  // inset is derived here so it follows `bottom` immediately.
  useEffect(() => {
    if (!visible || height === 0) return;
    ref.current?.measureInWindow((_x, y) =>
      setBarLayout({ top: y, inset: bottom + height, height })
    );
  }, [visible, bottom, height, setBarLayout]);

  // Collapse when the bar goes away (modal opened, keyboard up).
  useEffect(() => {
    if (!visible && expanded) closeControls();
  }, [visible, expanded, closeControls]);

  // Android back collapses the list before it navigates.
  useEffect(() => {
    if (!expanded) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeControls();
      return true;
    });
    return () => sub.remove();
  }, [expanded, closeControls]);

  if (!visible) return null;

  const { primary, othersCount } = barSummary(timers, now);
  if (!primary) return null;
  const primaryLabel = timerLabel(t, primary.title, primary.step);
  const isDone = primary.state === 'done';
  const fg = isDone ? c.onPrimary : c.text;

  const openRecipe = (timer: Timer) => {
    closeControls();
    if (pathname === `/recipe/${timer.recipeId}`) return;
    router.push({ pathname: '/recipe/[id]', params: { id: String(timer.recipeId) } });
  };

  return (
    <>
      {expanded ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeControls}
            accessibilityRole="button"
            accessibilityLabel={t('timer.collapseA11y')}
          />
          <View
            style={[
              styles.panel,
              {
                bottom: bottom + height + Spacing.sm,
                maxHeight: windowHeight * 0.6,
              },
            ]}
          >
            <Text style={styles.panelTitle} accessibilityRole="header">
              {t('timer.listTitle')}
            </Text>
            <ScrollView>
              {orderTimers(timers, now).map((timer) => {
                const label = timerLabel(t, timer.title, timer.step);
                const done = timer.state === 'done';
                return (
                  <View
                    key={timer.id}
                    style={[styles.row, timer.id === highlightId && styles.rowHighlight]}
                  >
                    <View style={styles.rowTop}>
                      <Pressable
                        onPress={() => openRecipe(timer)}
                        accessibilityRole="link"
                        accessibilityLabel={t('timer.openRecipeA11y', { title: timer.title })}
                        style={({ pressed }) => [styles.rowLabelWrap, pressed && styles.pressed]}
                      >
                        <Text style={styles.rowLabel} numberOfLines={2}>
                          {label}
                        </Text>
                      </Pressable>
                      <Text
                        style={[styles.rowStatus, done && { color: c.primary }]}
                        accessibilityLabel={statusSpoken(t, timer, now)}
                      >
                        {statusText(t, timer, now)}
                      </Text>
                    </View>
                    <View style={styles.rowActions}>
                      {timer.state === 'running' ? (
                        <TextAction
                          label={t('timer.pause')}
                          onPress={() => pauseTimer(timer.id)}
                          color={c.primary}
                          styles={styles}
                        />
                      ) : null}
                      {timer.state === 'paused' ? (
                        <TextAction
                          label={t('timer.resume')}
                          onPress={() => resumeTimer(timer.id)}
                          color={c.primary}
                          styles={styles}
                        />
                      ) : null}
                      <TextAction
                        label={t('timer.addMinute')}
                        onPress={() => addMinute(timer.id)}
                        color={c.primary}
                        styles={styles}
                      />
                      <TextAction
                        label={done ? t('timer.dismiss') : t('timer.stop')}
                        onPress={() => stopTimer(timer.id)}
                        color={c.primary}
                        styles={styles}
                      />
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </>
      ) : null}

      <View
        ref={ref}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setHeight(h);
          ref.current?.measureInWindow((_x, y) =>
            setBarLayout({ top: y, inset: bottom + h, height: h })
          );
        }}
        style={[
          styles.bar,
          { bottom },
          isDone
            ? { backgroundColor: c.primary, borderColor: c.primary }
            : { backgroundColor: c.surface, borderColor: c.border },
        ]}
      >
        <Pressable
          onPress={expanded ? closeControls : () => openControls()}
          accessibilityRole="button"
          accessibilityLabel={
            expanded
              ? t('timer.collapseA11y')
              : t('timer.barA11y', {
                  label: primaryLabel,
                  remaining: statusSpoken(t, primary, now),
                })
          }
          accessibilityState={{ expanded }}
          style={({ pressed }) => [styles.barMain, pressed && styles.pressed]}
        >
          <Ionicons
            name={isDone ? 'alarm-outline' : primary.state === 'paused' ? 'pause' : 'timer-outline'}
            size={Typography.size.lg}
            color={isDone ? fg : c.primary}
          />
          <Text style={[styles.barLabel, { color: fg }]} numberOfLines={1}>
            {primaryLabel}
          </Text>
          <Text style={[styles.barStatus, { color: fg }]}>
            {statusText(t, primary, now)}
          </Text>
          {othersCount > 0 ? (
            <View
              style={[
                styles.morePill,
                { backgroundColor: isDone ? c.onPrimary : c.surfaceAlt },
              ]}
            >
              <Text style={[styles.moreText, { color: isDone ? c.primary : c.textSecondary }]}>
                {t('timer.more', { count: othersCount })}
              </Text>
            </View>
          ) : null}
        </Pressable>
        {isDone ? (
          <TextAction
            label={t('timer.dismiss')}
            onPress={() => stopTimer(primary.id)}
            color={fg}
            styles={styles}
          />
        ) : null}
      </View>
    </>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: Spacing.base,
      right: Spacing.base,
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: Spacing.sm,
      borderRadius: Radius.md,
      borderWidth: 1,
      ...Shadow.lg,
    },
    barMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      minHeight: Touch.list,
      paddingLeft: Spacing.base,
      paddingRight: Spacing.sm,
    },
    barLabel: {
      flex: 1,
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.medium,
    },
    barStatus: {
      fontSize: Typography.size.md,
      fontWeight: Typography.weight.bold,
      fontVariant: ['tabular-nums'],
    },
    morePill: {
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xxs,
    },
    moreText: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
    },
    panel: {
      position: 'absolute',
      left: Spacing.base,
      right: Spacing.base,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingVertical: Spacing.sm,
      ...Shadow.lg,
    },
    panelTitle: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: Spacing.base,
      paddingBottom: Spacing.xs,
    },
    row: {
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    rowHighlight: {
      backgroundColor: c.surfaceAlt,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    rowLabelWrap: {
      flex: 1,
      minHeight: Touch.min,
      justifyContent: 'center',
    },
    rowLabel: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.medium,
      color: c.text,
      textDecorationLine: 'underline',
    },
    rowStatus: {
      fontSize: Typography.size.md,
      fontWeight: Typography.weight.bold,
      fontVariant: ['tabular-nums'],
      color: c.text,
    },
    rowActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: Spacing.base,
    },
    textAction: {
      minHeight: Touch.min,
      minWidth: Touch.min,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.xs,
    },
    textActionLabel: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.bold,
    },
    pressed: {
      opacity: 0.6,
    },
  });
