import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, Typography, Spacing } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import IconButton from './IconButton';

type Props = {
  title: string;
  onClose: () => void;
};

// Shared title + close-button bar for modal screens.
export default function ModalHeader({ title, onClose }: Props) {
  const c = useTheme();
  const t = useT();
  return (
    <View style={[styles.header, { borderBottomColor: c.border }]}>
      <Text
        style={[styles.title, { color: c.text }]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <IconButton
        icon="close"
        size={24}
        accessibilityLabel={t('a11y.close')}
        onPress={onClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: Spacing.base,
    paddingRight: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  title: {
    flex: 1,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
  },
});
