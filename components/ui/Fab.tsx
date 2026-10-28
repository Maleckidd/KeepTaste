import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Spacing, Radius, Shadow, Motion } from '@/constants/theme';
import { useSnackbarTop } from '@/components/ui/SnackbarProvider';

type Props = {
  /** Required — the FAB is icon-only. */
  accessibilityLabel: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /**
   * Stack screens need the home-indicator inset added; tab screens sit above
   * the tab bar, which already consumes it.
   */
  withBottomInset?: boolean;
};

// Floating action button — the screen's primary action, pinned bottom-right
// in the thumb zone. While a snackbar is up it slides above it, so neither
// covers the other's action (SPEC.md §6).
export default function Fab({
  accessibilityLabel,
  onPress,
  icon = 'add',
  withBottomInset = true,
}: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const snackbarTop = useSnackbarTop();
  const ref = useRef<View>(null);
  // Window y of the FAB's resting bottom edge. Measured on layout only, when
  // the FAB is not lifted, so the lift never feeds back into the measurement.
  const [restingBottom, setRestingBottom] = useState<number | null>(null);
  const lift = useRef(new Animated.Value(0)).current;

  const overlap =
    snackbarTop !== null && restingBottom !== null
      ? Math.max(0, restingBottom - snackbarTop + Spacing.sm)
      : 0;

  // JS driver on purpose: with the native driver Fabric still hit-tests the
  // FAB at its resting spot, so a tap on the snackbar action under it pressed
  // the FAB instead.
  useEffect(() => {
    Animated.timing(lift, {
      toValue: -overlap,
      duration: Motion.duration.base,
      useNativeDriver: false,
    }).start();
  }, [lift, overlap]);

  return (
    <Animated.View
      ref={ref}
      onLayout={() =>
        ref.current?.measureInWindow((_x, y, _w, h) => setRestingBottom(y + h))
      }
      style={[
        styles.fab,
        {
          bottom: Spacing.lg + (withBottomInset ? insets.bottom : 0),
          transform: [{ translateY: lift }],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: c.primary },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name={icon} size={30} color={c.onPrimary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    width: 56,
    height: 56,
  },
  // The shadow sits on the colored button, not the transparent wrapper —
  // Android elevation needs a background to cast one.
  button: {
    flex: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.lg,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
