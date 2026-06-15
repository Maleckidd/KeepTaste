import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import ModalHeader from '@/components/ui/ModalHeader';
import ActionSheet, { ActionSheetAction } from '@/components/ui/ActionSheet';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import {
  type RecipeFormData,
  emptyRecipeFormData,
  isRecipeFormDirty,
} from '@/utils/recipeForm';

type Props = {
  /** Modal title, e.g. "New recipe" / "Edit recipe". */
  title: string;
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
  title,
  initialData,
  onSave,
  onCancel,
  isLoading,
}: Props) {
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const initial = initialData ?? emptyRecipeFormData();
  const [form, setForm] = useState<RecipeFormData>(initial);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  // Inline validation instead of an Alert; cleared as soon as the user types.
  const [titleError, setTitleError] = useState(false);

  const set = (key: keyof RecipeFormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handlePickImage = async () => {
    // Uses the Android system photo picker / iOS PHPicker — no media-library
    // permission needed, which is why READ_MEDIA_IMAGES is not declared.
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
      Alert.alert(t('common.permissionRequired'), t('common.permissionCamera'));
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

  const photoActions: ActionSheetAction[] = [
    { label: t('common.gallery'), icon: 'images-outline', onPress: handlePickImage },
    { label: t('common.camera'), icon: 'camera-outline', onPress: handleTakePhoto },
    ...(form.imagePath
      ? [
          {
            label: t('common.removePhoto'),
            icon: 'trash-outline' as const,
            destructive: true,
            onPress: () => set('imagePath', ''),
          },
        ]
      : []),
  ];

  const handleSave = async () => {
    if (!form.title.trim()) {
      setTitleError(true);
      return;
    }
    await onSave(form);
  };

  const handleCancel = () => {
    if (isRecipeFormDirty(initial, form)) {
      Alert.alert(t('common.discardTitle'), t('common.discardMessage'), [
        { text: t('common.keepEditing'), style: 'cancel' },
        { text: t('common.discard'), style: 'destructive', onPress: onCancel },
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
      <ModalHeader title={title} onClose={handleCancel} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title + photo */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Field label={t('recipeForm.title')}>
              <Input
                large
                placeholder={t('recipeForm.titlePlaceholder')}
                value={form.title}
                onChangeText={(v) => {
                  if (titleError) setTitleError(false);
                  set('title', v);
                }}
                returnKeyType="next"
                style={titleError ? { borderColor: c.error } : undefined}
              />
              {titleError ? (
                <Text style={styles.fieldError} accessibilityLiveRegion="polite">
                  {t('recipeForm.missingTitleMessage')}
                </Text>
              ) : null}
            </Field>
          </View>
          <Pressable
            style={({ pressed }) => [styles.photoButton, pressed && { opacity: 0.7 }]}
            onPress={() => setPhotoMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.changePhoto')}
          >
            {form.imagePath ? (
              <Image
                source={{ uri: form.imagePath }}
                style={styles.photoThumb}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="camera-outline" size={22} color={c.primary} />
            )}
          </Pressable>
        </View>

        {/* Times */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label={t('recipeForm.prep')}>
              <Input
                placeholder="15"
                value={form.prepTime}
                onChangeText={(v) => set('prepTime', v)}
                keyboardType="numeric"
                maxLength={4}
                returnKeyType="next"
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('recipeForm.cook')}>
              <Input
                placeholder="45"
                value={form.cookTime}
                onChangeText={(v) => set('cookTime', v)}
                keyboardType="numeric"
                maxLength={4}
                returnKeyType="next"
              />
            </Field>
          </View>
          <View style={{ flex: 0.7 }}>
            <Field label={t('recipeForm.servings')}>
              <Input
                placeholder="4"
                value={form.servings}
                onChangeText={(v) => set('servings', v)}
                keyboardType="numeric"
                maxLength={3}
                returnKeyType="next"
              />
            </Field>
          </View>
        </View>

        {/* Ingredients */}
        <Field
          label={t('recipeForm.ingredients')}
          hint={t('recipeForm.ingredientsHint')}
        >
          <Input
            placeholder={t('recipeForm.ingredientsPlaceholder')}
            value={form.ingredients}
            onChangeText={(v) => set('ingredients', v)}
            multiline
          />
        </Field>

        {/* Instructions */}
        <Field
          label={t('recipeForm.instructions')}
          hint={t('recipeForm.instructionsHint')}
        >
          <Input
            style={styles.inputMultilineTall}
            placeholder={t('recipeForm.instructionsPlaceholder')}
            value={form.instructions}
            onChangeText={(v) => set('instructions', v)}
            multiline
          />
        </Field>

        {/* Notes */}
        <Field
          label={t('recipeForm.notes')}
          hint={t('recipeForm.notesHint')}
        >
          <Input
            placeholder={t('recipeForm.notesPlaceholder')}
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            multiline
          />
        </Field>
      </ScrollView>

      {/* Save stays pinned in the thumb zone, above the keyboard */}
      <View style={styles.footer}>
        <Button
          label={t('common.save')}
          onPress={handleSave}
          loading={isLoading}
        />
      </View>

      <ActionSheet
        visible={photoMenuOpen}
        title={t('recipeForm.photoTitle')}
        actions={photoActions}
        onClose={() => setPhotoMenuOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  scrollContent: {
    padding: Spacing.base,
    gap: Spacing.base,
    paddingBottom: Spacing.xl,
  },
  footer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.background,
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
  inputMultilineTall: {
    minHeight: 220,
  },
  fieldError: {
    fontSize: Typography.size.sm,
    color: c.error,
    marginTop: Spacing.xs,
  },
});
