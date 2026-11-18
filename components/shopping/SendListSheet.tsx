import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  BackHandler,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
  Motion,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import Button from '@/components/ui/Button';
import { pluralPl } from '@/utils/i18n';
import type { ShoppingItem } from '@/db/schema';
import type { TranslationKey } from '@/i18n/dictionary';

type Props = {
  visible: boolean;
  // The list's active items; all start selected.
  items: ShoppingItem[];
  onClose: () => void;
  // Fired with the selection once the sheet has left the screen.
  onSend: (selected: ShoppingItem[]) => void;
};

const sendKeys: Record<ReturnType<typeof pluralPl>, TranslationKey> = {
  one: 'shopping.send.one',
  few: 'shopping.send.few',
  many: 'shopping.send.many',
};

// Choose-what-to-send sheet (SPEC §5.18). Same overlay pattern as
// PasteListSheet (no native <Modal>); must be a direct child of the screen
// root. The selection is ephemeral: it picks what goes out, nothing is saved.
export default function SendListSheet({
  visible,
  items,
  onClose,
  onSend,
}: Props) {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const styles = makeStyles(c);

  const [rendered, setRendered] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(420);
  const progress = useRef(new Animated.Value(0)).current;

  // A snapshot from the moment the sheet opens: an Undo delete expiring behind
  // the sheet reloads the list, and `checked` must keep lining up by index.
  const [candidates, setCandidates] = useState<ShoppingItem[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setCandidates(items);
      setChecked(items.map(() => true));
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
    // items is deliberately not a dependency: a later change must not reset an
    // open sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const maxSheetHeight = windowHeight - insets.top - Spacing.xl;
  const sheetChromeHeight = 220 + insets.bottom;
  const contentMaxHeight = Math.max(120, maxSheetHeight - sheetChromeHeight);

  const checkedCount = checked.filter(Boolean).length;
  const allChecked = candidates.length > 0 && checkedCount === candidates.length;

  const toggleItem = (index: number) => {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const toggleAll = () => {
    const next = !allChecked;
    setChecked(candidates.map(() => next));
  };

  const handleSend = () => {
    if (checkedCount === 0) return;
    const selected = candidates.filter((_, i) => checked[i]);
    onClose();
    // The system chooser opens over the app, which then stops drawing: a sheet
    // still on its way out would stay visible under it (cf. the PDF overlay,
    // §5.14).
    setTimeout(() => onSend(selected), Motion.duration.fast + 50);
  };

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
            maxHeight: maxSheetHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('shopping.sendTitle')}</Text>

        <View style={styles.body}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t('addToList.products')} ({checkedCount}/{candidates.length})
            </Text>
            <Pressable
              onPress={toggleAll}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.toggleAll}>
                {allChecked
                  ? t('addToList.selectNone')
                  : t('addToList.selectAll')}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={{ maxHeight: contentMaxHeight }}
            contentContainerStyle={styles.card}
            showsVerticalScrollIndicator={false}
          >
            {candidates.map((item, index) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowBorder,
                  pressed && { backgroundColor: c.surfaceAlt },
                ]}
                onPress={() => toggleItem(index)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: checked[index] }}
                accessibilityLabel={
                  item.quantity ? `${item.name}, ${item.quantity}` : item.name
                }
              >
                <Ionicons
                  name={checked[index] ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={checked[index] ? c.primary : c.textMuted}
                />
                <Text
                  style={[
                    styles.rowText,
                    !checked[index] && styles.rowTextMuted,
                  ]}
                >
                  {item.name}
                </Text>
                {item.quantity ? (
                  <Text style={styles.rowQty}>{item.quantity}</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>

          <Button
            label={
              checkedCount === 0
                ? t('addToList.addDisabled')
                : t(sendKeys[pluralPl(checkedCount)], { count: checkedCount })
            }
            onPress={handleSend}
            disabled={checkedCount === 0}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'flex-end',
      zIndex: 1000,
      elevation: 1000,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
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
      marginBottom: Spacing.base,
    },
    body: {
      gap: Spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    toggleAll: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.primary,
    },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.md,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      minHeight: 48,
    },
    rowBorder: {
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    rowText: {
      flex: 1,
      fontSize: Typography.size.base,
      color: c.text,
    },
    rowTextMuted: {
      color: c.textMuted,
    },
    rowQty: {
      fontSize: Typography.size.sm,
      color: c.textSecondary,
    },
  });
