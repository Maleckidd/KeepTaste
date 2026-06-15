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
  type CookbookFormData,
  emptyCookbookFormData,
  isCookbookFormDirty,
} from '@/utils/cookbookForm';

type Props = {
  /** Modal title, e.g. "New cookbook" / "Edit cookbook". */
  title: string;
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
  title,
  initialData,
  onSave,
  onCancel,
  isLoading,
}: Props) {
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const initial = initialData ?? emptyCookbookFormData();
  const [form, setForm] = useState<CookbookFormData>(initial);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  // Inline validation instead of an Alert; cleared as soon as the user types.
  const [nameError, setNameError] = useState(false);

  const set = (key: keyof CookbookFormData, value: string) =>
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
      set('coverImagePath', result.assets[0].uri);
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
      set('coverImagePath', result.assets[0].uri);
    }
  };

  const photoActions: ActionSheetAction[] = [
    { label: t('common.gallery'), icon: 'images-outline', onPress: handlePickImage },
    { label: t('common.camera'), icon: 'camera-outline', onPress: handleTakePhoto },
    ...(form.coverImagePath
      ? [
          {
            label: t('common.removePhoto'),
            icon: 'trash-outline' as const,
            destructive: true,
            onPress: () => set('coverImagePath', ''),
          },
        ]
      : []),
  ];

  const handleSave = async () => {
    if (!form.name.trim()) {
      setNameError(true);
      return;
    }
    await onSave(form);
  };

  const handleCancel = () => {
    if (isCookbookFormDirty(initial, form)) {
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
        {/* Name + cover */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Field label={t('cookbookForm.name')}>
              <Input
                large
                placeholder={t('cookbookForm.namePlaceholder')}
                value={form.name}
                onChangeText={(v) => {
                  if (nameError) setNameError(false);
                  set('name', v);
                }}
                returnKeyType="done"
                style={nameError ? { borderColor: c.error } : undefined}
              />
              {nameError ? (
                <Text style={styles.fieldError} accessibilityLiveRegion="polite">
                  {t('cookbookForm.missingNameMessage')}
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
            {form.coverImagePath ? (
              <Image
                source={{ uri: form.coverImagePath }}
                style={styles.photoThumb}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="camera-outline" size={22} color={c.primary} />
            )}
          </Pressable>
        </View>
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
        title={t('cookbookForm.coverTitle')}
        actions={photoActions}
        onClose={() => setPhotoMenuOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  footer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.background,
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
  fieldError: {
    fontSize: Typography.size.sm,
    color: c.error,
    marginTop: Spacing.xs,
  },
});
