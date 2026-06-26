import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import ModalHeader from '@/components/ui/ModalHeader';
import ActionSheet, { ActionSheetAction } from '@/components/ui/ActionSheet';
import FormattingHelpSheet from '@/components/ui/FormattingHelpSheet';
import ImportSheet from '@/components/recipe/ImportSheet';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
  Touch,
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
  /** Shows the "Import from a link or text" affordance (create mode only). */
  enableImport?: boolean;
};

function Field({
  label,
  children,
  hint,
  linkText,
  onLinkPress,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  /** Optional tappable link shown under the field (e.g. "See formatting tips"). */
  linkText?: string;
  onLinkPress?: () => void;
}) {
  const c = useTheme();
  const fieldStyles = useMemo(() => makeFieldStyles(c), [c]);
  return (
    <View style={fieldStyles.container}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
      {hint ? <Text style={fieldStyles.hint}>{hint}</Text> : null}
      {linkText && onLinkPress ? (
        <Pressable
          onPress={onLinkPress}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [
            fieldStyles.linkRow,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons
            name="help-circle-outline"
            size={15}
            color={c.primary}
          />
          <Text style={fieldStyles.link}>{linkText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeFieldStyles = (c: ThemePalette) => StyleSheet.create({
  container: { gap: Spacing.xs },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  link: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: c.primary,
  },
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
  enableImport,
}: Props) {
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const initial = initialData ?? emptyRecipeFormData();
  const [form, setForm] = useState<RecipeFormData>(initial);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [formatHelpOpen, setFormatHelpOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Inline validation instead of an Alert; cleared as soon as the user types.
  const [titleError, setTitleError] = useState(false);

  const set = (key: keyof RecipeFormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Import only sets content fields (never imagePath — the partial excludes it).
  const applyImport = (partial: Partial<RecipeFormData>) => {
    setForm((prev) => ({ ...prev, ...partial }));
    setImportOpen(false);
  };

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
      behavior="padding"
      style={{ flex: 1 }}
    >
      <ModalHeader title={title} onClose={handleCancel} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Import affordance (create mode only) */}
        {enableImport ? (
          <Pressable
            onPress={() => setImportOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.import')}
            style={({ pressed }) => [
              styles.importButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="download-outline" size={18} color={c.primary} />
            <Text style={styles.importLabel}>{t('recipeForm.importAction')}</Text>
          </Pressable>
        ) : null}

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
          linkText={t('recipeForm.formatHelpLink')}
          onLinkPress={() => setFormatHelpOpen(true)}
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
          linkText={t('recipeForm.formatHelpLink')}
          onLinkPress={() => setFormatHelpOpen(true)}
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

      <FormattingHelpSheet
        visible={formatHelpOpen}
        onClose={() => setFormatHelpOpen(false)}
      />

      {enableImport ? (
        <ImportSheet
          visible={importOpen}
          onClose={() => setImportOpen(false)}
          onResult={applyImport}
        />
      ) : null}
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
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: Touch.min,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  importLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.primary,
  },
});
