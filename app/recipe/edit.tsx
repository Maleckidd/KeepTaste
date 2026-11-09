import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import RecipeForm from '@/components/recipe/RecipeForm';
import {
  type RecipeFormData,
  recipeToFormData,
  recipeSaveNotice,
} from '@/utils/recipeForm';
import { getRecipeById, updateRecipe } from '@/db/recipes';
import { createCookbook, getCookbooks } from '@/db/cookbooks';
import type { Cookbook } from '@/db/schema';
import { filterPendingDeletes } from '@/utils/pendingDelete';
import { useSnackbar } from '@/components/ui/SnackbarProvider';
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
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { showSnackbar } = useSnackbar();
  const originalImagePath = useRef<string | null>(null);
  // The cookbook before editing — a change means the save moved the recipe.
  const originalCookbookId = useRef<number | null>(null);

  useEffect(() => {
    async function load() {
      const recipeId = Number(id);
      const [recipe, allCookbooks] = await Promise.all([
        getRecipeById(recipeId),
        getCookbooks(),
      ]);
      setCookbooks(filterPendingDeletes(allCookbooks, 'cookbook', (cb) => cb.id));
      if (recipe) {
        originalImagePath.current = recipe.imagePath ?? null;
        originalCookbookId.current = recipe.cookbookId ?? null;
        setInitialData(recipeToFormData(recipe));
      }
    }
    load();
  }, [id]);

  // Quick "New cookbook" from the picker (§5.5): name only, the form then
  // selects the returned id. Reloaded first so the picker already lists it.
  const handleCreateCookbook = async (name: string) => {
    const id = await createCookbook({ name, coverImagePath: null });
    const all = await getCookbooks();
    setCookbooks(filterPendingDeletes(all, 'cookbook', (cb) => cb.id));
    return id;
  };

  const handleSave = async (data: RecipeFormData) => {
    setIsLoading(true);
    const recipeId = Number(id);
    try {
      const imagePath = await persistImage(
        data.imagePath || null,
        originalImagePath.current
      );
      await updateRecipe(recipeId, {
        cookbookId: data.cookbookId,
        title: data.title.trim(),
        prepTime: parsePositiveInt(data.prepTime),
        cookTime: parsePositiveInt(data.cookTime),
        servings: parsePositiveInt(data.servings),
        imagePath,
        ingredients: data.ingredients,
        instructions: data.instructions,
        notes: data.notes || null,
        toTry: data.toTry ? 1 : 0,
      });

      router.back();
      // Only a move is announced; a plain edit returns to the recipe view,
      // which already shows the result (§5.5 "Save confirmation").
      const notice = recipeSaveNotice(
        'edit',
        originalCookbookId.current,
        data.cookbookId,
        cookbooks
      );
      if (notice?.kind === 'moved') {
        showSnackbar({
          message: t('recipeForm.movedTo', {
            name: notice.cookbookName ?? t('recipeForm.noCookbook'),
          }),
        });
      }
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
        cookbooks={cookbooks}
        onSave={handleSave}
        onCancel={() => router.back()}
        onCreateCookbook={handleCreateCookbook}
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
