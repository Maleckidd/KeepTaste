// Inline timer chip for a duration in the recipe Instructions (SPEC.md §5.21).
// Idle it shows the duration as written; tapping starts a timer, after which
// the chip shows the live countdown (tap → bar controls) and finally "Time's
// up" (tap → dismiss). Rendered as an inline view inside the paragraph <Text>.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Typography, Spacing, Radius, Touch } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import { lightTap } from '@/utils/haptics';
import {
  findTimerForChip,
  formatCountdown,
  formatDurationWords,
  remainingSeconds,
} from '@/utils/timers';
import { useTimerNow, useTimers } from './TimerProvider';

type Props = {
  recipeId: number;
  /** Recipe title, stored on the timer for its label. */
  title: string;
  step: number | null;
  sourceKey: string;
  /** The duration as written in the Instructions ("20–25 min"). */
  text: string;
  seconds: number;
  fontScale: number;
};

const CHIP_PADDING_V = Spacing.xxs;
// Icon-to-text ratio: the glyph tracks the zoomed reading size (§5.4) but sits
// slightly smaller so it doesn't push the line height up.
const ICON_SCALE = 0.9;

export default function TimerChip({
  recipeId,
  title,
  step,
  sourceKey,
  text,
  seconds,
  fontScale,
}: Props) {
  const c = useTheme();
  const t = useT();
  const now = useTimerNow();
  const { timers, startTimer, openControls, stopTimer } = useTimers();
  const timer = findTimerForChip(timers, recipeId, sourceKey);

  const fontSize = Typography.size.reading * fontScale;
  const lineHeight = Math.round(fontSize * Typography.lineHeight.tight);
  const iconSize = Math.round(fontSize * ICON_SCALE);
  // Grow the touch area to Touch.min without changing the line's layout.
  const slop = Math.max(0, Math.ceil((Touch.min - lineHeight - 2 * CHIP_PADDING_V) / 2));

  const done = timer?.state === 'done';
  const fg = done ? c.onPrimary : c.primary;
  const bg = done ? c.primary : c.surfaceAlt;

  let label: string;
  let a11y: string;
  let icon: React.ComponentProps<typeof Ionicons>['name'];
  let onPress: () => void;

  if (!timer) {
    label = text;
    icon = 'timer-outline';
    a11y = t('timer.chipA11y', { duration: formatDurationWords(seconds, t) });
    onPress = () => {
      void lightTap();
      startTimer({ recipeId, sourceKey, title, step, durationSec: seconds });
    };
  } else if (timer.state === 'done') {
    label = t('timer.done');
    icon = 'alarm-outline';
    a11y = t('timer.chipDoneA11y');
    onPress = () => stopTimer(timer.id);
  } else {
    const remaining = remainingSeconds(timer, now);
    label = formatCountdown(remaining);
    const paused = timer.state === 'paused';
    icon = paused ? 'pause' : 'timer-outline';
    a11y = t(paused ? 'timer.chipPausedA11y' : 'timer.chipRunningA11y', {
      remaining: formatDurationWords(remaining, t),
    });
    onPress = () => openControls(timer.id);
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={{ top: slop, bottom: slop, left: Spacing.xs, right: Spacing.xs }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: bg, borderColor: done ? c.primary : c.border },
        pressed && styles.pressed,
      ]}
    >
      {/* Fixed box: Ionicons renders an empty <Text /> until its font loads
          (it is not embedded), and on Android the paragraph keeps the inline
          chip's first-measured width — so a zero-width icon left the chip
          wider than its slot, covering the following words. */}
      <View style={{ width: iconSize, height: iconSize }}>
        <Ionicons name={icon} size={iconSize} color={fg} />
      </View>
      <Text
        style={[
          styles.label,
          { color: fg, fontSize, lineHeight },
          timer && !done ? styles.countdown : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: CHIP_PADDING_V,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  label: {
    fontWeight: Typography.weight.semibold,
  },
  countdown: {
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.6,
  },
});
