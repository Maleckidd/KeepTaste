import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Spacing, Radius, Shadow } from '@/constants/theme';

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
// in the thumb zone. Hide it on empty states that show their own CTA.
export default function Fab({
  accessibilityLabel,
  onPress,
  icon = 'add',
  withBottomInset = true,
}: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: c.primary,
          bottom: Spacing.lg + (withBottomInset ? insets.bottom : 0),
        },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={30} color={c.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    width: 56,
    height: 56,
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
