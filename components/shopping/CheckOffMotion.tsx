import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useTheme,
  Typography,
  Spacing,
  Radius,
  Shadow,
  Motion,
  Touch,
} from '@/constants/theme';
import { prefersReducedMotion } from '@/utils/motion';

/**
 * How long a checked row stays in place, playing its check animation, before
 * it moves to "In cart" (SPEC.md §5.10). Also the window in which a second tap
 * cancels a mis-tap.
 */
export const CHECK_OFF_DELAY_MS = 450;

// Every animation here runs on the row's own Animated values, never through
// LayoutAnimation — that one is global and crashes the virtualized shopping
// list on Android when rows are structurally added/removed (see the list
// screen's handleToggle).

/**
 * Row wrapper: while `active`, the row slides a little right and fades to the
 * muted look of an in-cart row, then the screen moves it. Snaps back when the
 * check is cancelled. Reduce-motion keeps the fade and drops the slide.
 */
export function CheckOffMotion({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: active ? CHECK_OFF_DELAY_MS - Motion.duration.fast : Motion.duration.fast,
      // A short beat on the filled checkbox before the row starts to leave.
      delay: active ? Motion.duration.fast : 0,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [active, progress]);

  const reduce = prefersReducedMotion();
  return (
    <Animated.View
      style={{
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
        transform: reduce
          ? []
          : [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Spacing.xl] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Checkbox glyph that pops (scale up and back) when it turns checked. */
export function PopCheck({ checked, color }: { checked: boolean; color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const wasChecked = useRef(checked);

  useEffect(() => {
    if (checked && !wasChecked.current && !prefersReducedMotion()) {
      scale.setValue(0.6);
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 160,
        useNativeDriver: true,
      }).start();
    }
    wasChecked.current = checked;
  }, [checked, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={color} />
    </Animated.View>
  );
}

/**
 * Sticky "In cart · N" pill beside the FAB (SPEC.md §5.10) — says where
 * checked rows went, instead of a snackbar. It bumps whenever N grows, so the
 * row that just faded out visibly "lands" here; tapping scrolls to the cart.
 */
export function InCartPill({
  label,
  accessibilityLabel,
  count,
  visible,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  count: number;
  visible: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  const bump = useRef(new Animated.Value(1)).current;
  const shown = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const prevCount = useRef(count);
  // Stays mounted through the hide animation.
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) setRendered(true);
    Animated.timing(shown, {
      toValue: visible ? 1 : 0,
      duration: Motion.duration.base,
      useNativeDriver: true,
    }).start();
    if (visible) return;
    const timer = setTimeout(() => setRendered(false), Motion.duration.base + 50);
    return () => clearTimeout(timer);
  }, [visible, shown]);

  useEffect(() => {
    if (count > prevCount.current && !prefersReducedMotion()) {
      bump.setValue(1);
      Animated.sequence([
        Animated.timing(bump, {
          toValue: 1.18,
          duration: Motion.duration.fast,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(bump, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
    prevCount.current = count;
  }, [count, bump]);

  if (!rendered) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        opacity: shown,
        transform: [
          { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [Spacing.md, 0] }) },
          { scale: bump },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: c.surface, borderColor: c.border },
          pressed && { backgroundColor: c.surfaceAlt },
        ]}
      >
        <Ionicons name="cart-outline" size={20} color={c.primary} />
        <Text style={[styles.pillText, { color: c.text }]} numberOfLines={1}>
          {label}
        </Text>
        <View style={[styles.badge, { backgroundColor: c.primary }]}>
          <Text style={[styles.badgeText, { color: c.onPrimary }]}>{count}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Touch.min,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    ...Shadow.md,
  },
  pillText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
});
