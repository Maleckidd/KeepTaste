import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
  Motion,
  Touch,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// Plain-language "what you type → what you see" guide for the Markdown the
// recipe view renders. Mirrors ActionSheet's overlay pattern (no native
// <Modal>) so it stacks reliably and must be a direct child of the screen root.
export default function FormattingHelpSheet({ visible, onClose }: Props) {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(c);

  const [rendered, setRendered] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(420);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: Motion.duration.base,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: Motion.duration.fast,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => setRendered(false), Motion.duration.fast + 50);
    return () => clearTimeout(timer);
  }, [visible, progress]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!rendered) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight, 0],
  });

  const rows: {
    input: string;
    desc: string;
    result: React.ReactNode;
  }[] = [
    {
      input: t('formattingHelp.headingInput'),
      desc: t('formattingHelp.headingDesc'),
      result: <Text style={styles.resHeading}>{t('formattingHelp.headingResult')}</Text>,
    },
    {
      input: t('formattingHelp.boldInput'),
      desc: t('formattingHelp.boldDesc'),
      result: <Text style={styles.resBold}>{t('formattingHelp.boldResult')}</Text>,
    },
    {
      input: t('formattingHelp.bulletInput'),
      desc: t('formattingHelp.bulletDesc'),
      result: (
        <Text style={styles.resText}>
          {'•  '}
          {t('formattingHelp.bulletResult')}
        </Text>
      ),
    },
  ];

  return (
    <View style={styles.root} accessibilityViewIsModal pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t('a11y.close')}
        />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + Spacing.base,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('formattingHelp.title')}</Text>
        <Text style={styles.intro}>{t('formattingHelp.intro')}</Text>

        <View style={styles.headerRow}>
          <Text style={[styles.colHeader, styles.colInput]}>
            {t('formattingHelp.colInput')}
          </Text>
          <Text style={[styles.colHeader, styles.colResult]}>
            {t('formattingHelp.colResult')}
          </Text>
        </View>

        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            <View style={styles.colInput}>
              <View style={styles.code}>
                <Text style={styles.codeText}>{row.input}</Text>
              </View>
            </View>
            <View style={styles.colResult}>
              {row.result}
              <Text style={styles.desc}>{row.desc}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.note}>{t('formattingHelp.sectionNote')}</Text>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.close,
            pressed && { backgroundColor: c.surfaceAlt },
          ]}
        >
          <Text style={styles.closeLabel}>{t('a11y.close')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.base,
    ...Shadow.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: c.border,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: c.text,
  },
  intro: {
    fontSize: Typography.size.sm,
    color: c.textSecondary,
    lineHeight: Typography.size.sm * 1.5,
    marginTop: Spacing.xs,
    marginBottom: Spacing.base,
  },
  headerRow: {
    flexDirection: 'row',
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  colHeader: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  colInput: { flex: 1 },
  colResult: { flex: 1, paddingLeft: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  code: {
    alignSelf: 'flex-start',
    backgroundColor: c.surfaceAlt,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: Typography.size.sm,
    color: c.text,
  },
  resText: {
    fontSize: Typography.size.base,
    color: c.text,
  },
  resHeading: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: c.text,
  },
  resBold: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: c.text,
  },
  desc: {
    fontSize: Typography.size.xs,
    color: c.textMuted,
    marginTop: 2,
  },
  note: {
    fontSize: Typography.size.sm,
    color: c.textSecondary,
    lineHeight: Typography.size.sm * 1.5,
    marginTop: Spacing.base,
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Touch.min,
    marginTop: Spacing.base,
    borderRadius: Radius.md,
    backgroundColor: c.surfaceAlt,
  },
  closeLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text,
  },
});
