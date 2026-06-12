import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import RecipeForm from '@/components/recipe/RecipeForm';
import { type RecipeFormData, recipeToFormData } from '@/utils/recipeForm';
import { getRecipeById, updateRecipe } from '@/db/recipes';
import { useTheme, ThemePalette } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import { parsePositiveInt } from '@/utils/numeric';
import { persistImage } from '@/utils/imageStorage';

export default function EditRecipeScreen() {
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [initialData, setInitialData] = useState<RecipeFormData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const originalImagePath = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      const recipeId = Number(id);
      const recipe = await getRecipeById(recipeId);
      if (recipe) {
        originalImagePath.current = recipe.imagePath ?? null;
        setInitialData(recipeToFormData(recipe));
      }
    }
    load();
  }, [id]);

  const handleSave = async (data: RecipeFormData) => {
    setIsLoading(true);
    const recipeId = Number(id);
    try {
      const imagePath = await persistImage(
        data.imagePath || null,
        originalImagePath.current
      );
      await updateRecipe(recipeId, {
        title: data.title.trim(),
        prepTime: parsePositiveInt(data.prepTime),
        cookTime: parsePositiveInt(data.cookTime),
        servings: parsePositiveInt(data.servings),
        imagePath,
        ingredients: data.ingredients,
        instructions: data.instructions,
        notes: data.notes || null,
      });

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
      <RecipeForm
        title={t('stack.editRecipe')}
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
