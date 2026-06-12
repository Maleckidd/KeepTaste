import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CookbookForm from '@/components/cookbook/CookbookForm';
import { getCookbookById, updateCookbook } from '@/db/cookbooks';
import { useTheme, ThemePalette } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import {
  type CookbookFormData,
  cookbookToFormData,
  normalizeCookbookInput,
} from '@/utils/cookbookForm';
import { persistImage } from '@/utils/imageStorage';

export default function EditCookbookScreen() {
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [initialData, setInitialData] = useState<CookbookFormData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const originalCoverImagePath = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      const cookbookId = Number(id);
      const cookbook = await getCookbookById(cookbookId);
      if (cookbook) {
        originalCoverImagePath.current = cookbook.coverImagePath ?? null;
        setInitialData(cookbookToFormData(cookbook));
      }
    }
    load();
  }, [id]);

  const handleSave = async (data: CookbookFormData) => {
    setIsLoading(true);
    const cookbookId = Number(id);
    try {
      const input = normalizeCookbookInput(data);
      input.coverImagePath = await persistImage(
        input.coverImagePath,
        originalCoverImagePath.current
      );
      await updateCookbook(cookbookId, input);
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  if (!initialData) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CookbookForm
        title={t('stack.editCookbook')}
        initialData={initialData}
        onSave={handleSave}
        onCancel={() => router.back()}
        isLoading={isLoading}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
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
});
