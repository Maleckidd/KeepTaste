import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createShoppingList } from '@/db/shoppingLists';
import { useTheme, ThemePalette, Typography, Spacing } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import ModalHeader from '@/components/ui/ModalHeader';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function NewShoppingListScreen() {
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Inline validation instead of an Alert; cleared as soon as the user types.
  const [nameError, setNameError] = useState(false);

  const handleClose = () => {
    if (name.trim()) {
      Alert.alert(t('common.discardTitle'), t('common.discardMessage'), [
        { text: t('common.keepEditing'), style: 'cancel' },
        { text: t('common.discard'), style: 'destructive', onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      return;
    }
    setIsLoading(true);
    try {
      const id = await createShoppingList(trimmed);
      router.replace(`/shopping/${id}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        <ModalHeader title={t('shoppingNew.title')} onClose={handleClose} />

        <View style={styles.body}>
          <Text style={styles.label}>{t('shoppingNew.label')}</Text>
          <Input
            large
            placeholder={t('shoppingNew.placeholder')}
            value={name}
            onChangeText={(v) => {
              if (nameError) setNameError(false);
              setName(v);
            }}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            style={nameError ? { borderColor: c.error } : undefined}
          />
          {nameError ? (
            <Text style={styles.fieldError} accessibilityLiveRegion="polite">
              {t('shoppingNew.missingNameMessage')}
            </Text>
          ) : null}

          <Button
            label={t('shoppingNew.create')}
            onPress={handleCreate}
            loading={isLoading}
            style={styles.submit}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    body: {
      padding: Spacing.base,
      gap: Spacing.md,
    },
    label: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    submit: {
      marginTop: Spacing.sm,
    },
    fieldError: {
      fontSize: Typography.size.sm,
      color: c.error,
    },
  });
