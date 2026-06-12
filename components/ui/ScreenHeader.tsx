import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Typography, Spacing } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import IconButton from './IconButton';

type Props = {
  title: string;
  /** Show a back arrow that pops the current route. */
  back?: boolean;
  /** Right-aligned actions (IconButtons). */
  children?: React.ReactNode;
};

// Shared header for stack screens that hide the native navigation bar.
// Handles the top safe-area inset itself, so screens can use a plain View.
export default function ScreenHeader({ title, back = false, children }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useTheme();
  const t = useT();

  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
      {back ? (
        <IconButton
          icon="arrow-back"
          accessibilityLabel={t('a11y.back')}
          onPress={() => router.back()}
        />
      ) : null}
      <Text
        style={[styles.title, { color: c.text }]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    letterSpacing: -0.3,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
});
