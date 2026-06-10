import React, { useState, useMemo } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import CookbookForm from '@/components/cookbook/CookbookForm';
import { createCookbook } from '@/db/cookbooks';
import { useTheme, ThemePalette } from '@/constants/theme';
import { type CookbookFormData, normalizeCookbookInput } from '@/utils/cookbookForm';
import { persistImage } from '@/utils/imageStorage';

export default function NewCookbookScreen() {
  const router = useRouter();
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async (data: CookbookFormData) => {
    setIsLoading(true);
    try {
      const input = normalizeCookbookInput(data);
      input.coverImagePath = await persistImage(input.coverImagePath, null);
      await createCookbook(input);
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <CookbookForm
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
});
