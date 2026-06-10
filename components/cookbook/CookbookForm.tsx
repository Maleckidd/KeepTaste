import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
} from '@/constants/theme';
import {
  type CookbookFormData,
  emptyCookbookFormData,
  isCookbookFormDirty,
} from '@/utils/cookbookForm';

type Props = {
  initialData?: CookbookFormData;
  onSave: (data: CookbookFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const c = useTheme();
  const fieldStyles = useMemo(() => makeFieldStyles(c), [c]);
  return (
    <View style={fieldStyles.container}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

const makeFieldStyles = (c: ThemePalette) => StyleSheet.create({
  container: { gap: Spacing.xs },
  label: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});

export default function CookbookForm({
  initialData,
  onSave,
  onCancel,
  isLoading,
}: Props) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const initial = initialData ?? emptyCookbookFormData();
  const [form, setForm] = useState<CookbookFormData>(initial);

  const set = (key: keyof CookbookFormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'The app needs access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      set('coverImagePath', result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'The app needs access to the camera.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      set('coverImagePath', result.assets[0].uri);
    }
  };

  const handlePhotoPress = () =>
    Alert.alert('Cover photo', 'Where would you like to add a photo from?', [
      { text: 'Gallery', onPress: handlePickImage },
      { text: 'Camera', onPress: handleTakePhoto },
      form.coverImagePath
        ? {
            text: 'Remove photo',
            style: 'destructive',
            onPress: () => set('coverImagePath', ''),
          }
        : { text: 'Cancel', style: 'cancel' },
    ]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Please enter a cookbook name.');
      return;
    }
    await onSave(form);
  };

  const handleCancel = () => {
    if (isCookbookFormDirty(initial, form)) {
      Alert.alert('Discard changes?', 'Your changes will not be saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onCancel },
      ]);
      return;
    }
    onCancel();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
          disabled={isLoading}
        >
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Name + cover */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Field label="Cookbook name">
              <TextInput
                style={[styles.input, styles.inputLarge]}
                placeholder="e.g. Desserts..."
                placeholderTextColor={c.textMuted}
                value={form.name}
                onChangeText={(v) => set('name', v)}
                returnKeyType="done"
              />
            </Field>
          </View>
          <TouchableOpacity style={styles.photoButton} onPress={handlePhotoPress}>
            {form.coverImagePath ? (
              <Image
                source={{ uri: form.coverImagePath }}
                style={styles.photoThumb}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="camera-outline" size={22} color={c.primary} />
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  cancelButton: { padding: Spacing.xs },
  cancelText: {
    fontSize: Typography.size.base,
    color: c.textSecondary,
  },
  saveButton: {
    backgroundColor: c.primary,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: Spacing.base,
    gap: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.md,
  },
  photoButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Shadow.sm,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  input: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.size.base,
    color: c.text,
  },
  inputLarge: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.medium,
    paddingVertical: Spacing.md,
  },
});
