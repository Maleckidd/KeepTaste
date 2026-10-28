import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router as globalRouter, useLocalSearchParams, useRouter } from 'expo-router';
import RecipeForm from '@/components/recipe/RecipeForm';
import {
  type RecipeFormData,
  emptyRecipeFormData,
  initialCookbookId,
  recipeSaveNotice,
} from '@/utils/recipeForm';
import { createRecipe } from '@/db/recipes';
import { getCookbooks } from '@/db/cookbooks';
import type { Cookbook } from '@/db/schema';
import { filterPendingDeletes } from '@/utils/pendingDelete';
import {
  useSnackbar,
  NAVIGATION_SNACKBAR_MS,
} from '@/components/ui/SnackbarProvider';
import { useTheme, ThemePalette } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import { parsePositiveInt } from '@/utils/numeric';
import { persistImage } from '@/utils/imageStorage';
import { toImportIntent } from '@/utils/sharedUrl';

export default function NewRecipeScreen() {
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { cookbookId, sharedText } = useLocalSearchParams<{
    cookbookId?: string;
    // Raw text handed over by an Android share (§5.15). We derive the import
    // intent here rather than passing pre-split params so arbitrary text
    // survives Expo Router's URL-encoding of a single string param.
    sharedText?: string;
  }>();
  const [isLoading, setIsLoading] = useState(false);
  const { showSnackbar } = useSnackbar();
  // Cookbook picker choices (§5.5); null until loaded. The form mounts only
  // after this, because it reads its initial data (the pre-selected cookbook)
  // once on mount.
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);

  useEffect(() => {
    async function load() {
      const data = await getCookbooks();
      setCookbooks(filterPendingDeletes(data, 'cookbook', (cb) => cb.id));
    }
    load();
  }, []);

  // Pre-selects the cookbook the user came from, if it still exists.
  const initialData = useMemo(
    () =>
      cookbooks
        ? emptyRecipeFormData(initialCookbookId(cookbookId, cookbooks))
        : null,
    [cookbookId, cookbooks]
  );

  // Derive once from the param; a link/paste intent pre-arms the ImportSheet.
  const initialImport = useMemo(
    () => toImportIntent(sharedText) ?? undefined,
    [sharedText]
  );

  const handleSave = async (data: RecipeFormData) => {
    setIsLoading(true);
    try {
      const imagePath = await persistImage(data.imagePath || null, null);
      const newId = await createRecipe({
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
      // Tell the user where the recipe went (§5.5 "Save confirmation"). This
      // screen is unmounted by the time "Show" is tapped, so navigate through
      // the imperative router.
      const notice = recipeSaveNotice('create', null, data.cookbookId, cookbooks ?? []);
      showSnackbar({
        message:
          notice?.kind === 'savedIn'
            ? t('recipeForm.savedIn', { name: notice.cookbookName })
            : t('recipeForm.saved'),
        actionLabel: t('common.show'),
        onAction: () => globalRouter.push(`/recipe/${newId}`),
        durationMs: NAVIGATION_SNACKBAR_MS,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!cookbooks || !initialData) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <RecipeForm
        title={t('stack.newRecipe')}
        initialData={initialData}
        cookbooks={cookbooks}
        onSave={handleSave}
        onCancel={() => router.back()}
        isLoading={isLoading}
        enableImport
        initialImport={initialImport}
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
