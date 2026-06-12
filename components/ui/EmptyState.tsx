import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Typography, Spacing } from '@/constants/theme';
import Button from './Button';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title?: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: Props) {
  const c = useTheme();
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={56} color={c.border} />
      {title ? (
        <Text style={[styles.title, { color: c.textSecondary }]}>{title}</Text>
      ) : null}
      <Text style={[styles.text, { color: c.textMuted }]}>{text}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
    gap: Spacing.md,
  },
  title: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    textAlign: 'center',
  },
  text: {
    fontSize: Typography.size.base,
    textAlign: 'center',
    lineHeight: Typography.size.base * 1.5,
  },
  action: {
    marginTop: Spacing.sm,
  },
});
