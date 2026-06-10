import React, { useState, useMemo } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import RecipeForm from '@/components/recipe/RecipeForm';
import { type RecipeFormData } from '@/utils/recipeForm';
import { createRecipe } from '@/db/recipes';
import { useTheme, ThemePalette } from '@/constants/theme';
import { parsePositiveInt } from '@/utils/numeric';
import { persistImage } from '@/utils/imageStorage';

export default function NewRecipeScreen() {
  const router = useRouter();
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { cookbookId } = useLocalSearchParams<{ cookbookId?: string }>();
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async (data: RecipeFormData) => {
    setIsLoading(true);
    try {
      const imagePath = await persistImage(data.imagePath || null, null);
      await createRecipe({
        cookbookId: cookbookId ? Number(cookbookId) : null,
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

  return (
    <SafeAreaView style={styles.container}>
      <RecipeForm
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
