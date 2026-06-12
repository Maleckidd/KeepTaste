import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Markdown from 'react-native-markdown-display';
import { useKeepAwakeSafe } from '@/utils/keepAwake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecipeById, deleteRecipe } from '@/db/recipes';
import { deleteStoredImage } from '@/utils/imageStorage';
import { pendingDeleteKey } from '@/utils/pendingDelete';
import { useUndoDelete } from '@/components/ui/SnackbarProvider';
import { parseIngredients } from '@/utils/ingredients';
import { buildRecipeShareText } from '@/utils/recipeShareText';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Motion,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import IconButton from '@/components/ui/IconButton';
import Button from '@/components/ui/Button';
import ActionSheet from '@/components/ui/ActionSheet';
import type { Translator } from '@/utils/i18n';
import type { Recipe } from '@/db/schema';

function formatTime(
  t: Translator,
  minutes: number | null | undefined
): string {
  if (!minutes) return '';
  if (minutes < 60) return t('recipe.minutesShort', { count: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0
    ? t('recipe.hoursMinutes', { hours: h, minutes: m })
    : t('recipe.hours', { hours: h });
}

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const markdownStyles = useMemo(() => makeMarkdownStyles(c), [c]);

  // Cooking context: keep the screen on while a recipe is open.
  useKeepAwakeSafe();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const showUndoDelete = useUndoDelete();

  const loadData = useCallback(async () => {
    const r = await getRecipeById(Number(id));
    setRecipe(r || null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Confirmation first (deliberate speed bump for recipes), then the delete
  // still goes through the undo snackbar before committing.
  const handleDelete = () => {
    if (!recipe) return;
    Alert.alert(t('confirm.deleteRecipe', { title: recipe.title }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          showUndoDelete(
            pendingDeleteKey('recipe', recipe.id),
            recipe.title,
            async () => {
              await deleteRecipe(recipe.id);
              await deleteStoredImage(recipe.imagePath ?? null);
            }
          );
          router.back();
        },
      },
    ]);
  };

  const handleShare = async () => {
    if (!recipe) return;
    try {
      await Share.share({
        message: buildRecipeShareText(recipe, t),
        title: t('recipe.shareDialogTitle'),
      });
    } catch {
      // User dismissed or share unavailable — nothing to recover.
    }
  };

  if (!recipe) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  return (
    <View style={styles.container}>
      {/* Nav bar with actions */}
      <View style={[styles.navBar, { paddingTop: insets.top + Spacing.sm }]}>
        <IconButton
          icon="arrow-back"
          accessibilityLabel={t('a11y.back')}
          onPress={() => router.back()}
        />
        <View style={styles.navActions}>
          <IconButton
            icon="share-outline"
            accessibilityLabel={t('a11y.shareRecipe')}
            onPress={handleShare}
          />
          <IconButton
            icon="ellipsis-horizontal"
            accessibilityLabel={t('a11y.moreActions')}
            onPress={() => setMenuOpen(true)}
          />
        </View>
      </View>

      {/* Recipe menu ("…") — same pattern as the cookbook and list headers */}
      <ActionSheet
        visible={menuOpen}
        title={recipe.title}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            label: t('common.edit'),
            icon: 'create-outline',
            onPress: () =>
              router.push({ pathname: '/recipe/edit', params: { id } }),
          },
          {
            label: t('common.delete'),
            icon: 'trash-outline',
            destructive: true,
            onPress: handleDelete,
          },
        ]}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Spacing.xxxl + insets.bottom },
        ]}
      >
        {/* Photo or placeholder */}
        {recipe.imagePath ? (
          <Image
            source={{ uri: recipe.imagePath }}
            style={styles.heroImage}
            contentFit="cover"
            transition={Motion.duration.base}
            accessibilityLabel={t('a11y.recipePhoto')}
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="restaurant" size={48} color={c.border} />
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title} accessibilityRole="header">
            {recipe.title}
          </Text>

          {/* Metadata */}
          <View style={styles.metaRow}>
            {recipe.prepTime ? (
              <View style={styles.metaItem}>
                <Ionicons name="cut-outline" size={16} color={c.textSecondary} />
                <View>
                  <Text style={styles.metaLabel}>{t('recipe.prep')}</Text>
                  <Text style={styles.metaValue}>{formatTime(t, recipe.prepTime)}</Text>
                </View>
              </View>
            ) : null}
            {recipe.cookTime ? (
              <View style={styles.metaItem}>
                <Ionicons name="flame-outline" size={16} color={c.textSecondary} />
                <View>
                  <Text style={styles.metaLabel}>{t('recipe.cook')}</Text>
                  <Text style={styles.metaValue}>{formatTime(t, recipe.cookTime)}</Text>
                </View>
              </View>
            ) : null}
            {totalTime > 0 ? (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={16} color={c.textSecondary} />
                <View>
                  <Text style={styles.metaLabel}>{t('recipe.total')}</Text>
                  <Text style={styles.metaValue}>{formatTime(t, totalTime)}</Text>
                </View>
              </View>
            ) : null}
            {recipe.servings ? (
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={16} color={c.textSecondary} />
                <View>
                  <Text style={styles.metaLabel}>{t('recipe.servingsLabel')}</Text>
                  <Text style={styles.metaValue}>{recipe.servings}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Ingredients — on a card, visually separated from the steps */}
          {recipe.ingredients ? (
            <View style={styles.ingredientsCard}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {t('recipe.ingredients')}
              </Text>
              <Markdown style={markdownStyles}>{recipe.ingredients}</Markdown>
              {parseIngredients(recipe.ingredients).length > 0 ? (
                <Button
                  variant="secondary"
                  icon="cart-outline"
                  label={t('recipe.addToList')}
                  onPress={() =>
                    router.push({
                      pathname: '/recipe/add-to-list',
                      params: { id },
                    })
                  }
                  style={styles.addToListButton}
                />
              ) : null}
            </View>
          ) : null}

          {/* Instructions */}
          {recipe.instructions ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {t('recipe.instructions')}
              </Text>
              <Markdown style={markdownStyles}>{recipe.instructions}</Markdown>
            </View>
          ) : null}

          {/* Notes */}
          {recipe.notes ? (
            <View style={styles.notesBox}>
              <View style={styles.notesHeader}>
                <Ionicons name="document-text-outline" size={15} color={c.primary} />
                <Text style={styles.notesTitle}>{t('recipe.notes')}</Text>
              </View>
              <Text style={styles.notesText}>{recipe.notes}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

// Recipe content is read from a distance while cooking — base size 18pt
// (Typography.size.reading) with generous line height.
const makeMarkdownStyles = (c: ThemePalette) => ({
  body: {
    color: c.text,
    fontSize: Typography.size.reading,
    lineHeight: Typography.size.reading * 1.6,
  },
  heading1: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: c.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    lineHeight: Typography.size.xl * 1.3,
  },
  heading2: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    color: c.text,
    marginTop: Spacing.base,
    marginBottom: Spacing.xs,
    lineHeight: Typography.size.lg * 1.3,
  },
  strong: {
    fontWeight: Typography.weight.bold,
    color: c.text,
  },
  bullet_list: {
    marginVertical: Spacing.xs,
  },
  ordered_list: {
    marginVertical: Spacing.xs,
  },
  list_item: {
    marginVertical: Spacing.xs,
  },
  // Step numbers stand out in the primary color.
  ordered_list_icon: {
    color: c.primary,
    fontSize: Typography.size.reading,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.size.reading * 1.6,
    marginRight: Spacing.sm,
  },
  bullet_list_icon: {
    color: c.primary,
    fontSize: Typography.size.reading,
    lineHeight: Typography.size.reading * 1.6,
    marginRight: Spacing.sm,
  },
});

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  navActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },
  heroImage: {
    width: '100%',
    height: 240,
  },
  heroPlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.base,
    gap: Spacing.lg,
  },
  title: {
    fontSize: Typography.size.xxl,
    fontWeight: Typography.weight.bold,
    color: c.text,
    letterSpacing: -0.5,
    lineHeight: Typography.size.xxl * 1.2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.base,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaLabel: {
    fontSize: Typography.size.xs,
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValue: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text,
  },
  ingredientsCard: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addToListButton: {
    marginTop: Spacing.sm,
  },
  notesBox: {
    backgroundColor: c.surfaceAlt,
    borderRadius: Radius.md,
    padding: Spacing.base,
    borderLeftWidth: 3,
    borderLeftColor: c.primary,
    gap: Spacing.sm,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  notesTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesText: {
    fontSize: Typography.size.reading,
    color: c.text,
    lineHeight: Typography.size.reading * 1.5,
  },
});
