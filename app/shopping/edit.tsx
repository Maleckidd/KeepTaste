import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getShoppingListById,
  updateShoppingListName,
} from '@/db/shoppingLists';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
} from '@/constants/theme';

export default function EditShoppingListScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [name, setName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const originalName = useRef('');

  useEffect(() => {
    async function load() {
      const list = await getShoppingListById(Number(id));
      if (list) {
        originalName.current = list.name;
        setName(list.name);
      }
    }
    load();
  }, [id]);

  const handleClose = () => {
    if (name !== null && name.trim() !== originalName.current) {
      Alert.alert('Discard changes?', 'Your changes will not be saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  };

  const handleSave = async () => {
    const trimmed = (name ?? '').trim();
    if (!trimmed) {
      Alert.alert('Missing name', 'Please enter a list name.');
      return;
    }
    setIsLoading(true);
    try {
      await updateShoppingListName(Number(id), trimmed);
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  if (name === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Rename list</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={c.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <Text style={styles.label}>List name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Weekly shop..."
            placeholderTextColor={c.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <TouchableOpacity
            onPress={handleSave}
            style={[styles.primaryButton, isLoading && styles.disabled]}
            disabled={isLoading}
          >
            <Text style={styles.primaryButtonText}>Save</Text>
          </TouchableOpacity>
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
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    title: {
      fontSize: Typography.size.md,
      fontWeight: Typography.weight.semibold,
      color: c.text,
    },
    closeButton: {
      padding: Spacing.xs,
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
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      fontSize: Typography.size.lg,
      fontWeight: Typography.weight.medium,
      color: c.text,
    },
    primaryButton: {
      backgroundColor: c.primary,
      paddingVertical: Spacing.md,
      borderRadius: Radius.full,
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    disabled: {
      opacity: 0.5,
    },
    primaryButtonText: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: '#FFFFFF',
    },
  });
