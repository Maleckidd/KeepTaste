import React, { useEffect, useRef, useState } from 'react';
import {
  TextInput,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  BackHandler,
  Keyboard,
  Platform,
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
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Receives the trimmed, non-empty name; the sheet closes once it resolves. */
  onCreate: (name: string) => Promise<void>;
};

// Name-only "New cookbook" sheet opened from the recipe form's Cookbook picker
// (SPEC §5.5) — a lighter path than stacking the full cookbook modal on top of
// the recipe form. The cover is added later through Edit cookbook (§5.2).
// Same overlay pattern as PasteListSheet (no native <Modal>); must be a direct
// child of the screen root. It owns a text input, so it rides above the
// keyboard instead of dismissing it.
export default function QuickCookbookSheet({ visible, onClose, onCreate }: Props) {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(c);

  const [rendered, setRendered] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(280);
  const progress = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (visible) {
      // See PasteListSheet: an already-open keyboard never reaches the
      // keyboardHeight listeners below, so start from a closed one.
      Keyboard.dismiss();
      setName('');
      setNameError(false);
      setSaving(false);
      setKeyboardHeight(0);
      setRendered(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: Motion.duration.base,
        useNativeDriver: true,
      }).start(({ finished }) => {
        // Focus after the open (not autoFocus), once the listeners are live.
        if (finished) inputRef.current?.focus();
      });
      return;
    }
    Keyboard.dismiss();
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

  const handleCreate = async () => {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      return;
    }
    setSaving(true);
    try {
      await onCreate(trimmed);
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
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={styles.title} accessibilityRole="header">
          {t('recipeForm.newCookbook')}
        </Text>
        <View style={styles.body}>
          <Input
            ref={inputRef}
            placeholder={t('cookbookForm.namePlaceholder')}
            accessibilityLabel={t('cookbookForm.name')}
            value={name}
            onChangeText={(v) => {
              if (nameError) setNameError(false);
              setName(v);
            }}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          {nameError ? (
            <Text style={styles.error}>{t('cookbookForm.missingNameMessage')}</Text>
          ) : (
            <Text style={styles.hint}>{t('recipeForm.quickCookbookHint')}</Text>
          )}
          <Button
            label={t('recipeForm.quickCookbookCreate')}
            onPress={handleCreate}
            loading={saving}
            disabled={saving}
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
    hint: {
      fontSize: Typography.size.sm,
      color: c.textMuted,
      lineHeight: Typography.size.sm * 1.4,
    },
    error: {
      fontSize: Typography.size.sm,
      color: c.error,
      lineHeight: Typography.size.sm * 1.4,
    },
  });
