import React, { useEffect, useRef } from 'react';
import { Text, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, {
  SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTheme, Typography, Spacing, Radius } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import { lightTap } from '@/utils/haptics';

type Props = {
  children: React.ReactNode;
  onDelete: () => void;
  onEdit?: () => void;
  /** Label override for the edit action (e.g. "Rename"). */
  editLabel?: string;
  /**
   * One-time affordance: briefly slide the actions open and closed to teach
   * the swipe gesture exists. Flip to true once, on the first row only.
   */
  peek?: boolean;
};

// Only one row may stay open at a time (iOS Mail behavior).
let openRow: SwipeableMethods | null = null;

function ActionButton({
  icon,
  label,
  color,
  background,
  onPress,
  extraStyle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  background: string;
  onPress: () => void;
  extraStyle?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: background },
        extraStyle,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

// Swipe-left row revealing Edit (gray) and Delete (red) — the iOS
// Mail/Reminders pattern. Long-press menus stay available as the
// discoverable alternative; swipe is the power-user shortcut.
export default function SwipeableRow({
  children,
  onDelete,
  onEdit,
  editLabel,
  peek,
}: Props) {
  const c = useTheme();
  const t = useT();
  const ref = useRef<SwipeableMethods>(null);
  // True while the open is programmatic (the hint), so we skip the haptic that
  // would otherwise fire as if the user swiped.
  const peeking = useRef(false);

  const runAction = (action: () => void) => {
    ref.current?.close();
    action();
  };

  useEffect(() => {
    if (!peek) return;
    const open = setTimeout(() => {
      peeking.current = true;
      ref.current?.openRight();
    }, 450);
    const close = setTimeout(() => {
      ref.current?.close();
      peeking.current = false;
    }, 1650);
    return () => {
      clearTimeout(open);
      clearTimeout(close);
    };
  }, [peek]);

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={36}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        if (!peeking.current) lightTap();
        if (openRow && openRow !== ref.current) openRow.close();
        openRow = ref.current;
      }}
      onSwipeableClose={() => {
        if (openRow === ref.current) openRow = null;
      }}
      renderRightActions={() => (
        <View style={styles.actionsContainer}>
          <ActionButton
            icon="trash-outline"
            label={t('common.delete')}
            color={c.onPrimary}
            background={c.error}
            onPress={() => runAction(onDelete)}
          />
          {onEdit ? (
            <ActionButton
              icon="create-outline"
              label={editLabel ?? t('common.edit')}
              color={c.text}
              background={c.surfaceAlt}
              onPress={() => runAction(onEdit)}
              extraStyle={styles.editButton}
            />
          ) : null}
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  actionsContainer: {
    flexDirection: 'row',
    borderTopLeftRadius: Radius.lg,
    borderBottomLeftRadius: Radius.lg,
    overflow: 'hidden',
  },
  editButton: {
    borderTopRightRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  actionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
  },
});
