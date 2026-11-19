import React, { useEffect, useRef, useState } from 'react';
import {
  TextInput,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  BackHandler,
  Keyboard,
  Platform,
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
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { parsePastedProducts } from '@/utils/ingredients';
import { createShoppingItems } from '@/db/shoppingLists';
import { pluralPl } from '@/utils/i18n';
import type { TranslationKey } from '@/i18n/dictionary';

type Props = {
  visible: boolean;
  listId: number;
  onClose: () => void;
  // Fired after a successful bulk insert; parent reloads + shows a snackbar.
  onAdded: (count: number) => void;
  // Products already parsed from a paste into the add row (§5.10): the sheet
  // opens straight on Review with them all checked. null/empty → Paste step.
  initialProducts?: string[] | null;
};

type Step = 'paste' | 'review';

// Reuses §5.12's plural keys for the confirm button (Add N products).
const addKeys: Record<ReturnType<typeof pluralPl>, TranslationKey> = {
  one: 'addToList.add.one',
  few: 'addToList.add.few',
  many: 'addToList.add.many',
};

// Paste-products sheet (SPEC §5.16). Mirrors ImportSheet's overlay pattern
// (no native <Modal>) so it stacks reliably; must be a direct child of the
// screen root. Parses with parsePastedProducts (lines + inline separators)
// and inserts with createShoppingItems.
export default function PasteListSheet({
  visible,
  listId,
  onClose,
  onAdded,
  initialProducts,
}: Props) {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const styles = makeStyles(c);

  const [rendered, setRendered] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(420);
  const progress = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>('paste');
  const [text, setText] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (visible) {
      // See ImportSheet: a keyboard that was already open when the sheet opens
      // never reaches the keyboardHeight listeners below (they register with
      // `visible`), so the sheet would sit under the keys with no layout
      // fallback under edge-to-edge.
      Keyboard.dismiss();
      // Reset transient state each time the sheet opens. A paste into the add
      // row hands its parsed products over and skips straight to Review.
      if (initialProducts?.length) {
        setStep('review');
        setText('');
        setCandidates(initialProducts);
        setChecked(initialProducts.map(() => true));
      } else {
        setStep('paste');
        setText('');
        setCandidates([]);
        setChecked([]);
      }
      setError(null);
      setSaving(false);
      setKeyboardHeight(0);
      setRendered(true);
      const opensOnPaste = !initialProducts?.length;
      Animated.timing(progress, {
        toValue: 1,
        duration: Motion.duration.base,
        useNativeDriver: true,
      }).start(({ finished }) => {
        // Focus the field so the keyboard is up and typing lands somewhere
        // (iteration 3: a persona typed into a sheet with nothing focused).
        // After the open, not with autoFocus — by then the keyboardHeight
        // listeners below are registered, which Keyboard.dismiss() above
        // relies on.
        if (finished && opensOnPaste) inputRef.current?.focus();
      });
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: Motion.duration.fast,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => setRendered(false), Motion.duration.fast + 50);
    return () => clearTimeout(timer);
    // initialProducts is deliberately not a dependency: the parent sets it in
    // the same batch as `visible`, so it is current when the sheet opens, and
    // a later change must not reset an open sheet.
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

  useEffect(() => {
    if (!visible) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  if (!rendered) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight, 0],
  });

  const maxSheetHeight = windowHeight - insets.top - keyboardHeight - Spacing.xl;
  const sheetChromeHeight = 220 + insets.bottom;
  const contentMaxHeight = Math.max(120, maxSheetHeight - sheetChromeHeight);

  const checkedCount = checked.filter(Boolean).length;
  const allChecked = candidates.length > 0 && checkedCount === candidates.length;

  const handleNext = () => {
    const parsed = parsePastedProducts(text);
    if (parsed.length === 0) {
      setError(t('pasteList.empty'));
      return;
    }
    setCandidates(parsed);
    setChecked(parsed.map(() => true));
    setError(null);
    setStep('review');
    Keyboard.dismiss();
  };

  const toggleItem = (index: number) => {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const toggleAll = () => {
    const next = !allChecked;
    setChecked(candidates.map(() => next));
  };

  const handleAdd = async () => {
    if (checkedCount === 0 || saving) return;
    const names = candidates.filter((_, i) => checked[i]);
    setSaving(true);
    try {
      await createShoppingItems(listId, names);
      onAdded(names.length);
      onClose();
    } finally {
      setSaving(false);
    }
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
            marginBottom: keyboardHeight,
            maxHeight: maxSheetHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('pasteList.title')}</Text>

        {step === 'paste' ? (
          <View style={styles.body}>
            <Input
              ref={inputRef}
              style={[styles.pasteInput, { maxHeight: contentMaxHeight }]}
              placeholder={t('pasteList.placeholder')}
              value={text}
              onChangeText={(v) => {
                if (error) setError(null);
                setText(v);
              }}
              multiline
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={t('pasteList.next')}
              onPress={handleNext}
              disabled={!text.trim()}
            />
          </View>
        ) : (
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
              keyboardShouldPersistTaps="handled"
            >
              {candidates.map((name, index) => (
                <Pressable
                  key={index}
                  style={({ pressed }) => [
                    styles.row,
                    index > 0 && styles.rowBorder,
                    pressed && { backgroundColor: c.surfaceAlt },
                  ]}
                  onPress={() => toggleItem(index)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: checked[index] }}
                  accessibilityLabel={name}
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
                    {name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Button
              label={
                checkedCount === 0
                  ? t('addToList.addDisabled')
                  : t(addKeys[pluralPl(checkedCount)], { count: checkedCount })
              }
              onPress={handleAdd}
              loading={saving}
              disabled={checkedCount === 0 || saving}
            />
          </View>
        )}
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
    pasteInput: {
      minHeight: 160,
    },
    error: {
      fontSize: Typography.size.sm,
      color: c.error,
      lineHeight: Typography.size.sm * 1.4,
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
  });
