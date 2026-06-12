import React from 'react';
import { Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Radius, Shadow, Touch } from '@/constants/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  /** Required — icon-only buttons are invisible to screen readers without it. */
  accessibilityLabel: string;
  onPress: () => void;
  color?: string;
  size?: number;
  /** Raised circular variant (header action buttons on tab screens). */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  color,
  size = 22,
  raised = false,
  style,
}: Props) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        raised && { backgroundColor: c.surface, ...Shadow.sm },
        pressed && (raised ? { opacity: 0.7 } : { opacity: 0.5 }),
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color ?? c.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: Touch.min,
    height: Touch.min,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
