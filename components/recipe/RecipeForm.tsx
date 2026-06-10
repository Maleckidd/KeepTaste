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
  type RecipeFormData,
  emptyRecipeFormData,
  isRecipeFormDirty,
} from '@/utils/recipeForm';

type Props = {
  initialData?: RecipeFormData;
  onSave: (data: RecipeFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const c = useTheme();
  const fieldStyles = useMemo(() => makeFieldStyles(c), [c]);
  return (
    <View style={fieldStyles.container}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
      {hint ? <Text style={fieldStyles.hint}>{hint}</Text> : null}
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
  hint: {
    fontSize: Typography.size.xs,
    color: c.textMuted,
    lineHeight: Typography.size.xs * 1.5,
  },
});

export default function RecipeForm({
  initialData,
  onSave,
  onCancel,
  isLoading,
}: Props) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const initial = initialData ?? emptyRecipeFormData();
  const [form, setForm] = useState<RecipeFormData>(initial);

  const set = (key: keyof RecipeFormData, value: string) =>
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
      set('imagePath', result.assets[0].uri);
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
      set('imagePath', result.assets[0].uri);
    }
  };

  const handlePhotoPress = () =>
    Alert.alert('Photo', 'Where would you like to add a photo from?', [
      { text: 'Gallery', onPress: handlePickImage },
      { text: 'Camera', onPress: handleTakePhoto },
      form.imagePath
        ? { text: 'Remove photo', style: 'destructive', onPress: () => set('imagePath', '') }
        : { text: 'Cancel', style: 'cancel' },
    ]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('Missing title', 'Please enter a recipe title.');
      return;
    }
    await onSave(form);
  };

  const handleCancel = () => {
    if (isRecipeFormDirty(initial, form)) {
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
        {/* Title + photo */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Field label="Recipe title">
              <TextInput
                style={[styles.input, styles.inputLarge]}
                placeholder="e.g. Strawberry tart..."
                placeholderTextColor={c.textMuted}
                value={form.title}
                onChangeText={(v) => set('title', v)}
                returnKeyType="next"
              />
            </Field>
          </View>
          <TouchableOpacity style={styles.photoButton} onPress={handlePhotoPress}>
            {form.imagePath ? (
              <Image
                source={{ uri: form.imagePath }}
                style={styles.photoThumb}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="camera-outline" size={22} color={c.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Times */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Prep (min)">
              <TextInput
                style={styles.input}
                placeholder="15"
                placeholderTextColor={c.textMuted}
                value={form.prepTime}
                onChangeText={(v) => set('prepTime', v)}
                keyboardType="numeric"
                returnKeyType="next"
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Cook (min)">
              <TextInput
                style={styles.input}
                placeholder="45"
                placeholderTextColor={c.textMuted}
                value={form.cookTime}
                onChangeText={(v) => set('cookTime', v)}
                keyboardType="numeric"
                returnKeyType="next"
              />
            </Field>
          </View>
          <View style={{ flex: 0.7 }}>
            <Field label="Servings">
              <TextInput
                style={styles.input}
                placeholder="4"
                placeholderTextColor={c.textMuted}
                value={form.servings}
                onChangeText={(v) => set('servings', v)}
                keyboardType="numeric"
                returnKeyType="next"
              />
            </Field>
          </View>
        </View>

        {/* Ingredients */}
        <Field
          label="Ingredients"
          hint="Use a double line break to separate sections. A dash (-) creates a bullet point."
        >
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder={`200g flour\n100g butter\n- 3 eggs\n\n#Cream\n300ml heavy cream`}
            placeholderTextColor={c.textMuted}
            value={form.ingredients}
            onChangeText={(v) => set('ingredients', v)}
            multiline
            textAlignVertical="top"
          />
        </Field>

        {/* Instructions */}
        <Field
          label="Instructions"
          hint="Supports Markdown: # heading, **bold**"
        >
          <TextInput
            style={[styles.input, styles.inputMultilineTall]}
            placeholder={`# Prepare the dough\nMix the flour with the butter...\n\n# Baking\n**Bake for 45 minutes** at 180°C.`}
            placeholderTextColor={c.textMuted}
            value={form.instructions}
            onChangeText={(v) => set('instructions', v)}
            multiline
            textAlignVertical="top"
          />
        </Field>

        {/* Notes */}
        <Field
          label="Private notes"
          hint="Your remarks, tweaks, what to change next time..."
        >
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Next time add more vanilla sugar..."
            placeholderTextColor={c.textMuted}
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            multiline
            textAlignVertical="top"
          />
        </Field>
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
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
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
  inputMultiline: {
    minHeight: 120,
    paddingTop: Spacing.md,
    lineHeight: Typography.size.base * 1.6,
  },
  inputMultilineTall: {
    minHeight: 220,
    paddingTop: Spacing.md,
    lineHeight: Typography.size.base * 1.6,
  },
});
