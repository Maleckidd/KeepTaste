import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaView, StyleSheet, ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CookbookForm from '@/components/cookbook/CookbookForm';
import { getCookbookById, updateCookbook } from '@/db/cookbooks';
import { Colors } from '@/constants/theme';
import {
  type CookbookFormData,
  cookbookToFormData,
  normalizeCookbookInput,
} from '@/utils/cookbookForm';
import { persistImage } from '@/utils/imageStorage';

export default function EditCookbookScreen() {
  const router = useRouter();
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
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CookbookForm
        initialData={initialData}
        onSave={handleSave}
        onCancel={() => router.back()}
        isLoading={isLoading}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
