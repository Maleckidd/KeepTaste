import React, { useRef } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, {
  SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTheme, Typography, Spacing } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import { lightTap } from '@/utils/haptics';

type Props = {
  children: React.ReactNode;
  onDelete: () => void;
  onEdit?: () => void;
  /** Label override for the edit action (e.g. "Rename"). */
  editLabel?: string;
};

// Only one row may stay open at a time (iOS Mail behavior).
let openRow: SwipeableMethods | null = null;

function ActionButton({
  icon,
  label,
  color,
  background,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  background: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: background },
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
}: Props) {
  const c = useTheme();
  const t = useT();
  const ref = useRef<SwipeableMethods>(null);

  const runAction = (action: () => void) => {
    ref.current?.close();
    action();
  };

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={36}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        lightTap();
        if (openRow && openRow !== ref.current) openRow.close();
        openRow = ref.current;
      }}
      onSwipeableClose={() => {
        if (openRow === ref.current) openRow = null;
      }}
      renderRightActions={() => (
        <>
          {onEdit ? (
            <ActionButton
              icon="create-outline"
              label={editLabel ?? t('common.edit')}
              color={c.text}
              background={c.surfaceAlt}
              onPress={() => runAction(onEdit)}
            />
          ) : null}
          <ActionButton
            icon="trash-outline"
            label={t('common.delete')}
            color={c.onPrimary}
            background={c.error}
            onPress={() => runAction(onDelete)}
          />
        </>
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
  actionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
  },
});
