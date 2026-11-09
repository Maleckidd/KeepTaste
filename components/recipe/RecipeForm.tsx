import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { downscaleForStorage } from '@/utils/imageDownscale';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import ModalHeader from '@/components/ui/ModalHeader';
import ActionSheet, { ActionSheetAction } from '@/components/ui/ActionSheet';
import FormattingHelpSheet from '@/components/ui/FormattingHelpSheet';
import ImportSheet from '@/components/recipe/ImportSheet';
import type { ImportIntent } from '@/utils/sharedUrl';
import type { Cookbook } from '@/db/schema';
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
import QuickCookbookSheet from '@/components/recipe/QuickCookbookSheet';

type Props = {
  /** Modal title, e.g. "New recipe" / "Edit recipe". */
  title: string;
  initialData?: RecipeFormData;
  /** Choices for the Cookbook picker (§5.5); "No cookbook" is always offered. */
  cookbooks: Pick<Cookbook, 'id' | 'name'>[];
  onSave: (data: RecipeFormData) => Promise<void>;
  onCancel: () => void;
  /**
   * Adds a "New cookbook" entry to the Cookbook picker (§5.5), opening a
   * name-only sheet. Creates the cookbook, updates `cookbooks`, and resolves
   * with its id, which the form then selects.
   */
  onCreateCookbook?: (name: string) => Promise<number>;
  isLoading?: boolean;
  /** Shows the "Import from a link, text or photo" affordance (create mode only). */
  enableImport?: boolean;
  /**
   * When set (create mode via an Android share, §5.15), opens the ImportSheet
   * on mount pre-armed with this intent. Ignored unless `enableImport` is on.
   */
  initialImport?: ImportIntent;
};

function Field({
  label,
  children,
  labelHint,
  hint,
  linkText,
  onLinkPress,
}: {
  label: string;
  children: React.ReactNode;
  /** Short permanent guidance between the label and the input. */
  labelHint?: string;
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
      {labelHint ? <Text style={fieldStyles.hint}>{labelHint}</Text> : null}
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
  cookbooks,
  onSave,
  onCancel,
  onCreateCookbook,
  isLoading,
  enableImport,
  initialImport,
}: Props) {
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const initial = initialData ?? emptyRecipeFormData();
  const [form, setForm] = useState<RecipeFormData>(initial);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [cookbookMenuOpen, setCookbookMenuOpen] = useState(false);
  const [quickCookbookOpen, setQuickCookbookOpen] = useState(false);
  const [formatHelpOpen, setFormatHelpOpen] = useState(false);
  // Open the ImportSheet immediately when pre-armed by a share (§5.15). Only
  // honored in import-enabled create mode; consumed once on mount.
  const armedImport = !!enableImport && !!initialImport;
  const [importOpen, setImportOpen] = useState(armedImport);
  // The share pre-arm applies to the first (auto) open only; a manual reopen
  // must start blank. Cleared once the sheet has closed the first time.
  const [shareArmed, setShareArmed] = useState(armedImport);
  // Inline validation instead of an Alert; cleared as soon as the user types.
  const [titleError, setTitleError] = useState(false);

  const set = (key: keyof RecipeFormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setToTry = (value: boolean) =>
    setForm((prev) => ({ ...prev, toTry: value }));

  const setCookbookId = (value: number | null) =>
    setForm((prev) => ({ ...prev, cookbookId: value }));


  // Import only sets content fields (never imagePath — the partial excludes it;
  // never the cookbook the user already picked).
  const applyImport = (partial: Partial<RecipeFormData>) => {
    setForm((prev) => ({ ...prev, ...partial, cookbookId: prev.cookbookId }));
    setImportOpen(false);
    setShareArmed(false);
  };

  const handlePickImage = async () => {
    // Uses the Android system photo picker / iOS PHPicker — no media-library
    // permission needed, which is why READ_MEDIA_IMAGES is not declared.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      set('imagePath', await downscaleForStorage(a.uri, a.width, a.height));
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
      const a = result.assets[0];
      set('imagePath', await downscaleForStorage(a.uri, a.width, a.height));
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

  // An id that is not in the list (e.g. deleted meanwhile) reads as "No cookbook".
  const selectedCookbookName =
    cookbooks.find((cb) => cb.id === form.cookbookId)?.name ??
    t('recipeForm.noCookbook');

  const cookbookActions: ActionSheetAction[] = [
    {
      label: t('recipeForm.noCookbook'),
      selected: form.cookbookId === null,
      onPress: () => setCookbookId(null),
    },
    ...cookbooks.map((cb) => ({
      label: cb.name,
      selected: form.cookbookId === cb.id,
      onPress: () => setCookbookId(cb.id),
    })),
    ...(onCreateCookbook
      ? [
          {
            label: t('recipeForm.newCookbook'),
            icon: 'add' as const,
            onPress: () => setQuickCookbookOpen(true),
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

        {/* Cookbook (§5.5) — also the only way to move a recipe */}
        <Pressable
          onPress={() => setCookbookMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.cookbookPicker', {
            name: selectedCookbookName,
          })}
          style={({ pressed }) => [
            styles.cookbookRow,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.cookbookLabel}>{t('recipeForm.cookbook')}</Text>
          <Text style={styles.cookbookValue} numberOfLines={1}>
            {selectedCookbookName}
          </Text>
          <Ionicons name="chevron-down" size={18} color={c.textSecondary} />
        </Pressable>

        {/* Times */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label={t('recipeForm.prep')}>
              <Input
                placeholder={t('recipeForm.prepPlaceholder')}
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
                placeholder={t('recipeForm.cookPlaceholder')}
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
                placeholder={t('recipeForm.servingsPlaceholder')}
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
          labelHint={t('recipeForm.ingredientsHint')}
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

        {/* To try (§5.19) */}
        <Pressable
          style={styles.toTryRow}
          onPress={() => setToTry(!form.toTry)}
          accessibilityRole="switch"
          accessibilityState={{ checked: form.toTry }}
          accessibilityLabel={t('recipeForm.toTryLabel')}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.toTryLabel}>{t('recipeForm.toTryLabel')}</Text>
          </View>
          <Switch
            value={form.toTry}
            onValueChange={setToTry}
            trackColor={{ false: c.border, true: c.primary }}
            thumbColor={c.surface}
          />
        </Pressable>
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

      <ActionSheet
        visible={cookbookMenuOpen}
        title={t('recipeForm.cookbook')}
        actions={cookbookActions}
        onClose={() => setCookbookMenuOpen(false)}
      />

      {onCreateCookbook ? (
        <QuickCookbookSheet
          visible={quickCookbookOpen}
          onClose={() => setQuickCookbookOpen(false)}
          onCreate={async (name) => {
            const id = await onCreateCookbook(name);
            setCookbookId(id);
          }}
        />
      ) : null}

      <FormattingHelpSheet
        visible={formatHelpOpen}
        onClose={() => setFormatHelpOpen(false)}
      />

      {enableImport ? (
        <ImportSheet
          visible={importOpen}
          onClose={() => {
            setImportOpen(false);
            setShareArmed(false);
          }}
          onResult={applyImport}
          initialImport={shareArmed ? initialImport : undefined}
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
  toTryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Touch.min,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  cookbookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Touch.min,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  cookbookLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text,
  },
  // Takes the remaining width so a long name truncates instead of the label.
  cookbookValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: Typography.size.base,
    color: c.textSecondary,
  },
  toTryLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text,
  },
});
